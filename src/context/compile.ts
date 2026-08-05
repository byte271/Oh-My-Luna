/**
 * Deterministic context compilation.
 *
 * The owner's claim for v0.3.0: Luna has an unusually large context window but
 * gets confused once the context fills. `src/probes/context-degradation.ts`
 * measures whether that is true and, crucially, *which shape* the failure takes
 * — driven by size, or by position, or both. This module is the mechanism that
 * shape selects between.
 *
 * ## Why this is not a prompt tweak
 *
 * A prompt cannot enforce a budget, cannot report what it dropped, and cannot be
 * A/B tested against itself with content held constant. This can. It takes
 * ranked documents and a token budget and returns a context plus a manifest of
 * everything that did not fit and why.
 *
 * ## The one property that makes policy comparison meaningful
 *
 * **Changing the position policy must change ordering and nothing else.** The
 * set of included documents, and therefore the total token count, is fixed
 * before any policy runs. Without that, an A/B between two policies also varies
 * the content, and any difference measured is uninterpretable — the same
 * confound that made the first scoring run of comparison 02 unreadable. It is
 * asserted in the tests, not merely intended.
 *
 * ## What is claimed and what is not
 *
 * Claimed, and mechanically checked: the output never exceeds the budget; every
 * input document appears exactly once in either `included` or `excluded`; the
 * same input yields byte-identical output; policy does not alter membership.
 *
 * NOT claimed: that `edge_loaded` beats `as_ranked` for any real model. That is
 * a hypothesis, and the only instrument that can settle it needs live calls this
 * repository has never made. `recommendPolicy` maps a *measured* degradation
 * shape to a policy; it is a lookup from evidence to mechanism, and it returns
 * `as_ranked` when the evidence does not support moving anything.
 */

import { estimateTokens } from "../heldout/tokens.js";
import type { DegradationShape } from "../probes/context-degradation.js";

/**
 * Where the highest-ranked material is placed.
 *
 * - `as_ranked` — most relevant first. The default, and the control: it is what
 *   a ranker produces with no positional theory applied.
 * - `edge_loaded` — alternates head and tail, so the top-ranked documents sit at
 *   both extremes and the least relevant sit in the middle. The mechanism for a
 *   measured `degrades_in_middle`.
 * - `tail_loaded` — most relevant last, nearest the instruction. The mechanism
 *   for recency-weighted attention.
 */
export type PositionPolicy = "as_ranked" | "edge_loaded" | "tail_loaded";

export interface ContextDocument {
  readonly path: string;
  readonly content: string;
  /** Higher is more relevant. Supplied by the caller, e.g. `rankRepositoryDocuments`. */
  readonly score: number;
}

export type ExclusionReason =
  | "over_budget"
  | "exceeds_budget_alone"
  | "empty"
  | "duplicate_path";

export interface IncludedDocument {
  readonly path: string;
  /** 1-based position in the relevance ranking, before any policy is applied. */
  readonly rank: number;
  readonly score: number;
  readonly tokens: number;
  /** 0-based position in the emitted context, after the policy is applied. */
  readonly position: number;
  readonly pinned: boolean;
}

export interface ExcludedDocument {
  readonly path: string;
  readonly rank: number;
  readonly score: number;
  readonly tokens: number;
  readonly reason: ExclusionReason;
  /** Written for the caller who has to act on it, not for a log. */
  readonly detail: string;
}

export interface CompiledContext {
  readonly text: string;
  readonly total_tokens: number;
  readonly budget_tokens: number;
  readonly policy: PositionPolicy;
  readonly included: readonly IncludedDocument[];
  readonly excluded: readonly ExcludedDocument[];
}

export interface CompileOptions {
  /** Hard ceiling on the emitted context. Never exceeded. */
  readonly budgetTokens: number;
  readonly policy?: PositionPolicy;
  /**
   * Tokens held back for the instruction, question and the model's own reply.
   * Deducted from the budget before any document is considered.
   */
  readonly reserveTokens?: number;
  /**
   * Paths that must be included if they fit at all, regardless of rank.
   *
   * A pinned document that cannot fit is still excluded — silently keeping it
   * would breach the budget, which is the one guarantee this module makes — but
   * it is excluded with `exceeds_budget_alone` and a detail that says so, rather
   * than disappearing into a generic over-budget list.
   */
  readonly pinned?: readonly string[];
}

const HEADER = "The following files are provided as context.";

function renderDocument(doc: ContextDocument): string {
  return `<file path="${doc.path}">\n${doc.content}\n</file>`;
}

/**
 * Orders included documents without changing which documents they are.
 *
 * Membership is decided before this runs and is not consulted here — that is
 * what keeps a policy A/B an experiment about position alone.
 */
function applyPolicy<T>(ranked: readonly T[], policy: PositionPolicy): T[] {
  if (policy === "as_ranked") return [...ranked];
  if (policy === "tail_loaded") return [...ranked].reverse();
  // edge_loaded: rank 1 at the head, rank 2 at the tail, rank 3 next to rank 1,
  // and so on, so relevance decays toward the middle from both ends.
  const head: T[] = [];
  const tail: T[] = [];
  ranked.forEach((item, index) => {
    if (index % 2 === 0) head.push(item);
    else tail.unshift(item);
  });
  return [...head, ...tail];
}

/**
 * Selects and orders documents to fit a token budget, and reports the remainder.
 *
 * Selection is greedy by rank, and the two ways a document can fail to fit are
 * treated differently on purpose:
 *
 *   - **It cannot fit at any ranking** (`exceeds_budget_alone`). Skipped, and
 *     the fill continues. Whether it fits does not depend on anything above it,
 *     so skipping it is stable — and stopping would let one oversized file blank
 *     the entire context.
 *   - **It did not fit in what was left** (`over_budget`). This *stops* the
 *     fill, and every remaining document is excluded for the same reason.
 *     Continuing would promote a lower-ranked document past a higher-ranked one
 *     purely because it was smaller, making membership depend on the exact byte
 *     sizes of everything above it — so an unrelated edit reshuffles the context
 *     and two runs stop being comparable for reasons unrelated to relevance.
 */
export function compileContext(
  documents: readonly ContextDocument[],
  options: CompileOptions
): CompiledContext {
  const policy = options.policy ?? "as_ranked";
  const pinned = new Set(options.pinned ?? []);
  const reserve = Math.max(0, options.reserveTokens ?? 0);
  const available = Math.max(0, options.budgetTokens - reserve);

  // Stable and total: equal scores are broken by path so two runs over the same
  // repository cannot disagree. Pinned documents sort first, since a pin is a
  // statement that the caller knows something the ranker does not.
  const ranked = [...documents]
    .map((doc, index) => ({ doc, input_index: index }))
    .sort((a, b) => {
      const pinDelta = Number(pinned.has(b.doc.path)) - Number(pinned.has(a.doc.path));
      if (pinDelta !== 0) return pinDelta;
      if (b.doc.score !== a.doc.score) return b.doc.score - a.doc.score;
      return a.doc.path.localeCompare(b.doc.path) || a.input_index - b.input_index;
    });

  const included: { entry: IncludedDocument; rendered: string }[] = [];
  const excluded: ExcludedDocument[] = [];
  const seen = new Set<string>();

  // The header and the separators between documents are part of the emitted
  // text, so they are charged against the budget. A budget that counts only the
  // documents is a budget the assembled prompt can exceed.
  let used = estimateTokens(HEADER) + 1;
  let cutoffRank: number | null = null;

  ranked.forEach(({ doc }, index) => {
    const rank = index + 1;
    const rendered = renderDocument(doc);
    const tokens = estimateTokens(rendered) + 1;
    const base = { path: doc.path, rank, score: doc.score, tokens };

    if (seen.has(doc.path)) {
      excluded.push({
        ...base,
        reason: "duplicate_path",
        detail: `path appears more than once in the input; the first occurrence at rank ${
          included.find((i) => i.entry.path === doc.path)?.entry.rank ?? rank
        } was kept. Deduplicate before compiling — two versions of one file is a contradiction the model has to resolve silently.`
      });
      return;
    }
    seen.add(doc.path);

    if (doc.content.trim() === "") {
      excluded.push({
        ...base,
        reason: "empty",
        detail: "the document has no content; including it spends budget and teaches nothing"
      });
      return;
    }

    if (tokens > available) {
      excluded.push({
        ...base,
        reason: "exceeds_budget_alone",
        detail:
          `${tokens} tokens against a document budget of ${available}: this file cannot fit at any ranking. ` +
          (pinned.has(doc.path)
            ? "It was pinned, and the pin could not be honoured without breaching the budget. "
            : "") +
          "Raise the budget or supply an excerpt rather than the whole file."
      });
      return;
    }

    if (cutoffRank !== null) {
      excluded.push({
        ...base,
        reason: "over_budget",
        detail: `ranked ${rank} of ${ranked.length}, below the budget cut at rank ${cutoffRank}`
      });
      return;
    }

    if (used + tokens > available) {
      cutoffRank = rank;
      excluded.push({
        ...base,
        reason: "over_budget",
        detail:
          `${tokens} tokens would exceed the remaining ${available - used}; ranked ${rank} of ${ranked.length}. ` +
          "This is the budget cut — nothing below it is included, including documents that would have fit in the " +
          "space left. Promoting a lower-ranked document past this one because it happens to be smaller would make " +
          "membership depend on file sizes rather than relevance."
      });
      return;
    }

    used += tokens;
    included.push({
      entry: { ...base, position: -1, pinned: pinned.has(doc.path) },
      rendered
    });
  });

  const ordered = applyPolicy(included, policy);
  // No header when nothing was included. It would announce files that are not
  // there, and — when the budget is smaller than the header itself — it would
  // breach the one guarantee this module makes.
  const text = ordered.length === 0 ? "" : [HEADER, ...ordered.map((i) => i.rendered)].join("\n\n");

  return {
    text,
    total_tokens: estimateTokens(text),
    budget_tokens: options.budgetTokens,
    policy,
    included: ordered.map((i, position) => ({ ...i.entry, position })),
    excluded
  };
}

/**
 * A human-readable audit of what was left out.
 *
 * This is returned to the caller rather than embedded in the context. Embedding
 * it would spend budget on a prompt-design choice nothing here has measured; the
 * caller who needs it in the prompt can put it there deliberately.
 */
export function formatManifest(compiled: CompiledContext): string {
  const lines = [
    `policy=${compiled.policy} budget=${compiled.budget_tokens} used=${compiled.total_tokens} ` +
      `included=${compiled.included.length} excluded=${compiled.excluded.length}`
  ];
  if (compiled.excluded.length === 0) {
    lines.push("  everything supplied was included.");
    return lines.join("\n");
  }
  const byReason = new Map<ExclusionReason, ExcludedDocument[]>();
  for (const doc of compiled.excluded) {
    const bucket = byReason.get(doc.reason) ?? [];
    bucket.push(doc);
    byReason.set(doc.reason, bucket);
  }
  // Every excluded document stays in `excluded` for a caller that wants them
  // all. The listing is capped because a manifest that repeats itself forty
  // times is one nobody reads, and an unread manifest accounts for nothing.
  const LIST_LIMIT = 6;
  for (const [reason, docs] of byReason) {
    lines.push(`  ${reason} (${docs.length}):`);
    for (const doc of docs.slice(0, LIST_LIMIT)) lines.push(`    ${doc.path} — ${doc.detail}`);
    const rest = docs.slice(LIST_LIMIT);
    if (rest.length > 0) {
      lines.push(`    … and ${rest.length} more, ranked ${rest[0]?.rank} to ${rest[rest.length - 1]?.rank}`);
    }
  }
  return lines.join("\n");
}

/**
 * Maps a *measured* degradation shape to the policy that addresses it.
 *
 * The default is `as_ranked`, and it is returned whenever the measurement does
 * not support moving anything — including when no degradation was detected. A
 * function that always recommends a rearrangement would dress a hypothesis up as
 * a finding.
 */
export function recommendPolicy(shape: DegradationShape): {
  readonly policy: PositionPolicy;
  readonly rationale: string;
} {
  switch (shape) {
    case "degrades_in_middle":
    case "degrades_with_size_and_in_middle":
      return {
        policy: "edge_loaded",
        rationale:
          "recall measured lower at mid-context than at head and tail, so the least relevant material is placed there and the most relevant at both ends"
      };
    case "degrades_with_size":
      return {
        policy: "as_ranked",
        rationale:
          "recall fell with size but not with position, so reordering cannot help; reduce the budget instead — the fix is fewer tokens, not different tokens"
      };
    case "fails_everywhere":
      return {
        policy: "as_ranked",
        rationale:
          "recall was near zero at every size and depth, which is a sign the measurement itself is broken; fix the probe before changing the mechanism"
      };
    case "no_degradation_detected":
      return {
        policy: "as_ranked",
        rationale:
          "no size or position effect was measured, so there is nothing for a position policy to correct. Rearranging here would be a change made on no evidence"
      };
  }
}
