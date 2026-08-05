/**
 * Policy A/B: does the mechanism the measurement recommended actually help?
 *
 * `recommendPolicy` maps a measured degradation shape to a position policy.
 * Nothing checked whether taking that advice changes anything, which leaves the
 * mechanism in the same state the skill was in before comparison 02 was scored:
 * plausible, deployed, unverified.
 *
 * This runs the *same question* against the *same documents* compiled under each
 * policy, and reports where the needed document landed and whether it was
 * recalled. Because `compileContext` fixes membership before any policy runs,
 * the only thing varying across arms is position — which is what makes the
 * comparison readable at all.
 *
 * ## What this can and cannot settle without a live model
 *
 * Run against a synthetic responder, this is **not** circular, because the
 * compiler knows nothing about the responder. It reorders by rank; whether that
 * rescues a positional weakness depends on where the ranker put the needed
 * document, and that is a mechanical fact that can come out either way.
 *
 * What it therefore measures is **ranker quality × policy jointly**, and that is
 * the honest framing: `edge_loaded` can only pull a document to an edge if the
 * ranker scored it highly. `deepestRecalledRank` puts a number on exactly how
 * far down the ranking each policy still reaches.
 *
 * What it cannot settle is whether any real model has the positional weakness in
 * the first place. That is `context-degradation.ts`'s job, and it needs live
 * calls this repository has never made.
 */

import { compileContext, type ContextDocument, type PositionPolicy } from "../context/compile.js";
import { buildNeedle, type Needle, type Responder } from "./context-degradation.js";

const ALL_POLICIES: readonly PositionPolicy[] = ["as_ranked", "edge_loaded", "tail_loaded"];

export interface PolicyCorpus {
  readonly documents: readonly ContextDocument[];
  readonly needle: Needle;
  readonly needle_path: string;
  /** 1-based rank the needle document holds in the relevance ordering. */
  readonly needle_rank: number;
}

/** Deterministic PRNG; a textbook LCG loses its low bits in a double. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Builds a corpus of equal-sized documents with the needle in one of them.
 *
 * Equal sizes are deliberate. With documents of mixed length, a document's depth
 * *in lines* — which is what a positional weakness responds to — stops tracking
 * its position in the ordering, and the comparison would confound placement with
 * file size. Real corpora are not equal-sized; that is a limitation of this
 * measurement, stated rather than hidden.
 */
export function buildPolicyCorpus(options: {
  readonly documentCount: number;
  /** 1-based rank the needle document should hold. */
  readonly needleRank: number;
  readonly linesPerDocument?: number;
  readonly seed?: number;
}): PolicyCorpus {
  const count = options.documentCount;
  const lines = options.linesPerDocument ?? 8;
  const rand = mulberry32(options.seed ?? 4242);
  const needle = buildNeedle(rand);
  const index = Math.min(count - 1, Math.max(0, options.needleRank - 1));

  const documents: ContextDocument[] = Array.from({ length: count }, (_, i) => {
    const body = Array.from({ length: lines }, (_, l) => `  const value${i}_${l} = ${i * 100 + l};`);
    if (i === index) body.splice(Math.floor(lines / 2), 0, `  // ${needle.statement}`);
    return {
      path: `src/module-${String(i).padStart(3, "0")}.ts`,
      content: `export function module${i}() {\n${body.join("\n")}\n}`,
      // Descending, so document i holds rank i+1 with no ties to break.
      score: count - i
    };
  });

  return { documents, needle, needle_path: `src/module-${String(index).padStart(3, "0")}.ts`, needle_rank: index + 1 };
}

export interface PolicyTrial {
  readonly policy: PositionPolicy;
  readonly recalled: boolean;
  /** 0-based position of the needle document among included documents, or null if excluded. */
  readonly needle_position: number | null;
  /** Where the needle landed by line, 0.0 head to 1.0 tail. This is what a positional weakness sees. */
  readonly needle_line_depth: number | null;
  readonly included: number;
  readonly total_tokens: number;
}

export type PolicyVerdict =
  | "comparison_void"
  | "recalled_everywhere"
  | "recalled_nowhere"
  | "policy_changed_recall";

export interface PolicyComparison {
  readonly trials: readonly PolicyTrial[];
  /**
   * False when the arms did not contain the same documents. The comparison is
   * void, not merely noisy: a difference could be content rather than position.
   */
  readonly membership_identical: boolean;
  readonly needle_included: boolean;
  readonly best: PositionPolicy | null;
  readonly verdict: PolicyVerdict;
  readonly detail: string;
}

/**
 * Asks one responder the same question under each policy.
 */
export async function comparePolicies(
  responder: Responder,
  corpus: PolicyCorpus,
  options: { readonly budgetTokens: number; readonly policies?: readonly PositionPolicy[] }
): Promise<PolicyComparison> {
  const policies = options.policies ?? ALL_POLICIES;
  const trials: PolicyTrial[] = [];
  const memberships: string[] = [];

  for (const policy of policies) {
    const compiled = compileContext(corpus.documents, { budgetTokens: options.budgetTokens, policy });
    memberships.push([...compiled.included.map((d) => d.path)].sort().join("|"));

    const entry = compiled.included.find((d) => d.path === corpus.needle_path);
    const prompt = `${compiled.text}\n\n${corpus.needle.question}`;
    const promptLines = prompt.split("\n");
    const needleLine = promptLines.findIndex((l) => l.includes(corpus.needle.value));
    const answer = String(await responder(prompt));

    trials.push({
      policy,
      recalled: answer.includes(corpus.needle.value),
      needle_position: entry?.position ?? null,
      needle_line_depth:
        needleLine < 0 || promptLines.length <= 1 ? null : needleLine / (promptLines.length - 1),
      included: compiled.included.length,
      total_tokens: compiled.total_tokens
    });
  }

  const membershipIdentical = new Set(memberships).size <= 1;
  const needleIncluded = trials.some((t) => t.needle_position !== null);
  const recalled = trials.filter((t) => t.recalled);

  let verdict: PolicyVerdict;
  let detail: string;
  if (!membershipIdentical) {
    verdict = "comparison_void";
    detail =
      "the arms did not contain the same documents, so a difference in recall could be content rather than " +
      "position. This is a defect in the compiler, not a result.";
  } else if (!needleIncluded) {
    verdict = "recalled_nowhere";
    detail =
      `the needle document (rank ${corpus.needle_rank} of ${corpus.documents.length}) did not survive the ` +
      "budget under any policy. No position policy can help material that was excluded — raise the budget or " +
      "improve the ranking.";
  } else if (recalled.length === trials.length) {
    verdict = "recalled_everywhere";
    detail = `recalled under every policy; at rank ${corpus.needle_rank} there is nothing for a position policy to fix.`;
  } else if (recalled.length === 0) {
    verdict = "recalled_nowhere";
    detail =
      `recalled under no policy, though the document was included. At rank ${corpus.needle_rank} reordering ` +
      "cannot pull it far enough toward an edge; this is the limit of the mechanism, not a tuning problem.";
  } else {
    verdict = "policy_changed_recall";
    detail =
      `recalled under ${recalled.map((t) => t.policy).join(", ")} and not under ` +
      `${trials.filter((t) => !t.recalled).map((t) => t.policy).join(", ")}, at rank ${corpus.needle_rank} ` +
      `of ${corpus.documents.length}, with identical membership across arms.`;
  }

  return {
    trials,
    membership_identical: membershipIdentical,
    needle_included: needleIncluded,
    best: recalled[0]?.policy ?? null,
    verdict,
    detail
  };
}

export interface RankReach {
  readonly policy: PositionPolicy;
  /**
   * Deepest rank still recalled, counting only ranks recalled contiguously from
   * rank 1. A policy that recalls rank 3 and rank 9 but not ranks 4-8 does not
   * "reach" rank 9 in any useful sense, and reporting it as such would overstate
   * the mechanism.
   */
  readonly deepest_contiguous_rank: number;
  readonly recalled_ranks: readonly number[];
}

/**
 * Sweeps the needle down the ranking and reports how far each policy reaches.
 *
 * This is the headline number the mechanism can honestly produce: not "edge
 * loading works", but "edge loading keeps material out of mid-context down to
 * rank N, and beyond that it does not."
 */
export async function sweepNeedleRank(
  responder: Responder,
  options: {
    readonly documentCount: number;
    readonly budgetTokens: number;
    readonly ranks?: readonly number[];
    readonly linesPerDocument?: number;
    readonly policies?: readonly PositionPolicy[];
    readonly seed?: number;
  }
): Promise<readonly RankReach[]> {
  const policies = options.policies ?? ALL_POLICIES;
  const ranks = options.ranks ?? Array.from({ length: options.documentCount }, (_, i) => i + 1);
  const recalledBy = new Map<PositionPolicy, number[]>(policies.map((p) => [p, []]));

  for (const rank of ranks) {
    const corpus = buildPolicyCorpus({
      documentCount: options.documentCount,
      needleRank: rank,
      ...(options.linesPerDocument !== undefined ? { linesPerDocument: options.linesPerDocument } : {}),
      ...(options.seed !== undefined ? { seed: options.seed } : {})
    });
    const comparison = await comparePolicies(responder, corpus, {
      budgetTokens: options.budgetTokens,
      policies
    });
    for (const trial of comparison.trials) {
      if (trial.recalled) recalledBy.get(trial.policy)?.push(rank);
    }
  }

  const sortedRanks = [...ranks].sort((a, b) => a - b);
  return policies.map((policy) => {
    const recalled = new Set(recalledBy.get(policy) ?? []);
    let deepest = 0;
    for (const rank of sortedRanks) {
      if (!recalled.has(rank)) break;
      deepest = rank;
    }
    return { policy, deepest_contiguous_rank: deepest, recalled_ranks: [...recalled].sort((a, b) => a - b) };
  });
}

export function formatPolicyComparison(comparison: PolicyComparison): string {
  const rows = comparison.trials.map((t) => {
    const depth = t.needle_line_depth === null ? "  n/a" : t.needle_line_depth.toFixed(2).padStart(5);
    const position = t.needle_position === null ? "excluded" : `pos ${String(t.needle_position).padStart(3)}`;
    return `  ${t.recalled ? "ok  " : "MISS"} ${t.policy.padEnd(12)} ${position}  line-depth ${depth}`;
  });
  return `${rows.join("\n")}\n  → ${comparison.verdict}: ${comparison.detail}`;
}

export function formatRankReach(reaches: readonly RankReach[]): string {
  return reaches
    .map((r) => `  ${r.policy.padEnd(12)} reaches rank ${String(r.deepest_contiguous_rank).padStart(3)}`)
    .join("\n");
}
