/**
 * Long-context degradation probe.
 *
 * The claim this exists to test: a model with a very large context window
 * nevertheless degrades as the context fills — and the degradation is not
 * uniform, it depends on *where* in the context the needed information sits.
 *
 * **That claim is currently unmeasured in this repository.** It is recorded as
 * an owner assertion, exactly as the effort-parity claim was
 * (`data/provider-evidence/effort-parity-2026-08-03.json`). This module does not
 * assume it; it measures it, and it is capable of returning "no degradation
 * detected", which would falsify the premise cheaply.
 *
 * ## What is measured
 *
 * A verifiable fact — the *needle* — is placed at a controlled relative depth in
 * filler, and a question answerable only from that fact is asked. Recall is
 * scored by exact match on a token the filler cannot contain.
 *
 * Two axes, because they fail differently:
 *
 *   - **size**: how much context surrounds the needle;
 *   - **depth**: where the needle sits, 0.0 at the head, 1.0 at the tail.
 *
 * A model that simply cannot hold a large context degrades with size at every
 * depth. A model with a positional weakness degrades at mid-depth while the head
 * and tail stay strong — a different defect needing a different fix, and one
 * that a size-only measurement reports as "generally worse".
 *
 * ## Three design choices that decide whether this measures anything
 *
 * 1. **The needle must be unguessable.** It carries a random token the filler
 *    cannot contain. Without that, a responder scores well from its priors and
 *    the probe reports retrieval it never tested.
 * 2. **Distractors are a separate axis.** Real long-context failure is usually
 *    confusion between the needle and near-identical filler, not distance alone.
 *    Filler that shares the needle's *shape* but not its value is therefore a
 *    variant, not the default — measured apart so the two causes stay separable.
 * 3. **A control is mandatory.** A probe that reports "no degradation" for every
 *    responder has established nothing. `syntheticResponder` builds responders
 *    with known behaviour — perfect, mid-blind, size-limited, distractible — and
 *    the probe must classify each correctly before any real result is read.
 *    This is the growth probe's lesson, applied before rather than after.
 */

export type Responder = (prompt: string) => Promise<string> | string;

export interface DegradationCell {
  /** The requested size; the axis label the grid is grouped by. */
  readonly size_tokens: number;
  /** What was actually built and sent. Reported so the axis label can be audited. */
  readonly actual_tokens: number;
  /** 0.0 = needle at the head, 1.0 = needle at the tail. */
  readonly depth: number;
  readonly recalled: boolean;
  readonly answer_excerpt: string;
}

export type DegradationShape =
  | "no_degradation_detected"
  | "degrades_with_size"
  | "degrades_in_middle"
  | "degrades_with_size_and_in_middle"
  | "fails_everywhere";

export interface DegradationReport {
  readonly cells: readonly DegradationCell[];
  readonly overall_recall: number;
  /** Recall at the smallest size tested, across depths. */
  readonly recall_at_smallest: number;
  /** Recall at the largest size tested, across depths. */
  readonly recall_at_largest: number;
  /** Recall at head/tail depths versus middle depths, across all sizes. */
  readonly recall_at_edges: number;
  readonly recall_in_middle: number;
  readonly shape: DegradationShape;
  readonly detail: string;
}

export interface DegradationOptions {
  /** Approximate context sizes in tokens, ascending. */
  readonly sizes: readonly number[];
  /** Relative needle depths in [0,1]. */
  readonly depths: readonly number[];
  /**
   * When true, filler contains near-identical decoys that share the needle's
   * shape but not its value. Measures confusion rather than distance.
   */
  readonly distractors?: boolean;
  /** Deterministic seed so a run is reproducible. */
  readonly seed?: number;
  /** Drop below which a difference counts as degradation. */
  readonly threshold?: number;
}

/** Deterministic PRNG. A textbook LCG loses its low bits in a double. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WORDS = [
  "module", "handler", "buffer", "record", "segment", "channel", "session",
  "packet", "cursor", "registry", "adapter", "worker", "stream", "token"
];

export interface Needle {
  readonly key: string;
  readonly value: string;
  readonly statement: string;
  readonly question: string;
}

/**
 * Builds a needle whose value cannot be guessed from the filler or from priors.
 */
export function buildNeedle(rand: () => number): Needle {
  const value = `QX${Math.floor(rand() * 1e9).toString(36).toUpperCase()}-${Math.floor(rand() * 1e9).toString(36).toUpperCase()}`;
  const key = "retention-checksum";
  return {
    key,
    value,
    statement: `NOTE: the ${key} for this deployment is ${value}. Record it exactly.`,
    question: `What is the ${key} for this deployment? Answer with the value only.`
  };
}

/** Approximate token count, consistent with `src/heldout/tokens.ts`. */
const estTokens = (s: string): number => Math.ceil(Buffer.byteLength(s, "utf8") / 4);

export interface BuiltContext {
  readonly prompt: string;
  readonly needle: Needle;
  readonly actual_tokens: number;
}

/**
 * Assembles filler around a needle at a given relative depth.
 *
 * `distractors` inserts lines of the needle's exact shape carrying different
 * values, so a responder that pattern-matches the *shape* rather than reading
 * the value is caught.
 */
export function buildContext(
  needle: Needle,
  sizeTokens: number,
  depth: number,
  options: { distractors?: boolean; seed?: number } = {}
): BuiltContext {
  const rand = mulberry32(options.seed ?? 1);
  const lines: string[] = [];
  // Accumulate BYTES and round once at the end. Rounding each line to whole
  // tokens and summing over-counts by ~half a token per line — about 5% at these
  // line lengths — so the loop stops early and a context labelled 8000 tokens is
  // really 7573. A size axis whose labels are 5% wrong is not a size axis, and
  // the error grows as lines get shorter.
  const overhead = Buffer.byteLength(needle.statement, "utf8") + Buffer.byteLength(needle.question, "utf8") + 3;
  const targetBytes = Math.max(0, sizeTokens * 4 - overhead);
  let bytes = 0;
  while (bytes < targetBytes) {
    const n = 6 + Math.floor(rand() * 6);
    const words: string[] = [];
    for (let i = 0; i < n; i += 1) words.push(WORDS[Math.floor(rand() * WORDS.length)] ?? "module");
    let line = `- ${words.join(" ")} ${Math.floor(rand() * 10000)}`;
    if (options.distractors === true && rand() < 0.02) {
      const decoy = `QX${Math.floor(rand() * 1e9).toString(36).toUpperCase()}-${Math.floor(rand() * 1e9).toString(36).toUpperCase()}`;
      line = `NOTE: the ${needle.key} for a different deployment is ${decoy}. Ignore it.`;
    }
    lines.push(line);
    bytes += Buffer.byteLength(line, "utf8") + 1;
  }

  const at = Math.min(lines.length, Math.max(0, Math.round(depth * lines.length)));
  lines.splice(at, 0, needle.statement);
  const prompt = `${lines.join("\n")}\n\n${needle.question}`;
  return { prompt, needle, actual_tokens: estTokens(prompt) };
}

function classify(
  recallSmall: number,
  recallLarge: number,
  recallEdges: number,
  recallMiddle: number,
  overall: number,
  threshold: number
): DegradationShape {
  if (overall <= threshold) return "fails_everywhere";
  const sizeDrop = recallSmall - recallLarge > threshold;
  const middleDrop = recallEdges - recallMiddle > threshold;
  if (sizeDrop && middleDrop) return "degrades_with_size_and_in_middle";
  if (sizeDrop) return "degrades_with_size";
  if (middleDrop) return "degrades_in_middle";
  return "no_degradation_detected";
}

export async function probeContextDegradation(
  responder: Responder,
  options: DegradationOptions
): Promise<DegradationReport> {
  const threshold = options.threshold ?? 0.25;
  const seed = options.seed ?? 20260805;
  const cells: DegradationCell[] = [];

  for (const size of options.sizes) {
    for (const depth of options.depths) {
      const rand = mulberry32(seed + size * 31 + Math.round(depth * 1000));
      const needle = buildNeedle(rand);
      const built = buildContext(needle, size, depth, {
        ...(options.distractors === true ? { distractors: true } : {}),
        seed: seed + size
      });
      const answer = String(await responder(built.prompt));
      cells.push({
        size_tokens: size,
        actual_tokens: built.actual_tokens,
        depth,
        recalled: answer.includes(needle.value),
        answer_excerpt: answer.slice(0, 120)
      });
    }
  }

  const mean = (xs: readonly DegradationCell[]): number =>
    xs.length === 0 ? 0 : xs.filter((c) => c.recalled).length / xs.length;

  const smallest = Math.min(...options.sizes);
  const largest = Math.max(...options.sizes);
  const isEdge = (d: number): boolean => d <= 0.15 || d >= 0.85;

  const overall = mean(cells);
  const recallSmall = mean(cells.filter((c) => c.size_tokens === smallest));
  const recallLarge = mean(cells.filter((c) => c.size_tokens === largest));
  const recallEdges = mean(cells.filter((c) => isEdge(c.depth)));
  const recallMiddle = mean(cells.filter((c) => !isEdge(c.depth)));

  const shape = classify(recallSmall, recallLarge, recallEdges, recallMiddle, overall, threshold);
  const detail =
    shape === "no_degradation_detected"
      ? `recall ${(overall * 100).toFixed(0)}% with no size or position effect above ${(threshold * 100).toFixed(0)} points. If the premise was that this model degrades, this run does not support it.`
      : shape === "fails_everywhere"
        ? `recall ${(overall * 100).toFixed(0)}% at every size and depth. This is not a context finding — check that the needle is answerable at all.`
        : `recall ${(recallSmall * 100).toFixed(0)}% at ${smallest} tokens vs ${(recallLarge * 100).toFixed(0)}% at ${largest}; ` +
          `${(recallEdges * 100).toFixed(0)}% at head/tail vs ${(recallMiddle * 100).toFixed(0)}% mid-context.`;

  return {
    cells,
    overall_recall: overall,
    recall_at_smallest: recallSmall,
    recall_at_largest: recallLarge,
    recall_at_edges: recallEdges,
    recall_in_middle: recallMiddle,
    shape,
    detail
  };
}

/* ------------------------------------------------------- controls */

export type SyntheticBehaviour = "perfect" | "mid_blind" | "size_limited" | "distractible" | "blind";

/**
 * Responders with known behaviour, used to check the probe can tell them apart.
 *
 * A probe that reports the same shape for a perfect responder and a mid-blind
 * one is measuring nothing. This is the growth probe's positive control, built
 * in from the start rather than discovered to be missing later.
 */
export function syntheticResponder(behaviour: SyntheticBehaviour, limitTokens = 4000): Responder {
  return (prompt: string) => {
    const m = /NOTE: the retention-checksum for this deployment is (\S+?)\./.exec(prompt);
    const value = m?.[1] ?? "";
    if (behaviour === "blind" || value === "") return "I could not find it.";
    if (behaviour === "perfect") return value;

    const lines = prompt.split("\n");
    const index = lines.findIndex((l) => l.includes(value));
    const relative = lines.length <= 1 ? 0 : index / (lines.length - 1);

    if (behaviour === "mid_blind") return relative > 0.15 && relative < 0.85 ? "I could not find it." : value;
    if (behaviour === "size_limited") return estTokens(prompt) > limitTokens ? "I could not find it." : value;
    // distractible: answers with a decoy whenever one is present
    const decoy = /for a different deployment is (\S+?)\./.exec(prompt);
    return decoy?.[1] ?? value;
  };
}

/* ------------------------------------------------------- self-check */

/**
 * The grid the controls are checked on.
 *
 * Sizes are far enough apart that a size-limited responder falls off the cliff
 * between them, and depths avoid the 0.15/0.85 edge boundary — a depth sitting
 * exactly on the boundary is classified as an edge while the responder treats it
 * as middle, which would make the control's verdict an artifact of rounding.
 */
export const SELF_CHECK_GRID = {
  sizes: [2000, 8000],
  depths: [0, 0.25, 0.5, 0.75, 1.0],
  seed: 20260805
} as const satisfies DegradationOptions;

/** The size-limited control's cliff, between the two grid sizes. */
export const SELF_CHECK_LIMIT_TOKENS = 4000;

export interface SelfCheckCase {
  readonly behaviour: SyntheticBehaviour;
  readonly distractors: boolean;
  readonly expected: DegradationShape;
  readonly why: string;
}

/**
 * Every distinguishable failure mode, each with the shape the probe must report.
 *
 * If two rows here produce the same shape, the probe cannot tell those failures
 * apart and any real result it produces is uninterpretable — that is precisely
 * the defect the growth probe shipped with, where a catastrophic implementation
 * and two sound ones all came back "indeterminate".
 */
export const SELF_CHECK_CASES: readonly SelfCheckCase[] = [
  {
    behaviour: "perfect",
    distractors: false,
    expected: "no_degradation_detected",
    why: "a responder that always reads the needle must not be reported as degrading"
  },
  {
    behaviour: "blind",
    distractors: false,
    expected: "fails_everywhere",
    why: "total failure is not a context finding and must not be dressed up as one"
  },
  {
    behaviour: "mid_blind",
    distractors: false,
    expected: "degrades_in_middle",
    why: "a positional weakness must be reported as positional, not as 'generally worse'"
  },
  {
    behaviour: "size_limited",
    distractors: false,
    expected: "degrades_with_size",
    why: "a capacity limit must be separable from a positional one; the fixes differ"
  },
  {
    behaviour: "perfect",
    distractors: true,
    expected: "no_degradation_detected",
    why: "distractors must not break a responder that reads values rather than shapes"
  },
  {
    behaviour: "distractible",
    distractors: true,
    expected: "fails_everywhere",
    why: "answering with a same-shaped decoy must score as a miss, not as recall"
  }
];

export interface SelfCheckResult {
  readonly behaviour: SyntheticBehaviour;
  readonly distractors: boolean;
  readonly expected: DegradationShape;
  readonly actual: DegradationShape;
  readonly matched: boolean;
  readonly why: string;
}

export interface SelfCheck {
  readonly results: readonly SelfCheckResult[];
  /** True when the distractor axis changes a shape-matcher's verdict and leaves a value-reader's alone. */
  readonly distractor_axis_is_live: boolean;
  readonly passed: boolean;
  readonly detail: string;
}

/**
 * Runs every control and reports whether the probe separates them.
 *
 * Call this before reading any real result. A probe that has not been shown to
 * distinguish known-different responders has established nothing about an
 * unknown one, however plausible its output looks.
 */
export async function runSelfCheck(
  grid: DegradationOptions = SELF_CHECK_GRID
): Promise<SelfCheck> {
  const results: SelfCheckResult[] = [];
  for (const c of SELF_CHECK_CASES) {
    const report = await probeContextDegradation(
      syntheticResponder(c.behaviour, SELF_CHECK_LIMIT_TOKENS),
      { ...grid, ...(c.distractors ? { distractors: true } : {}) }
    );
    results.push({
      behaviour: c.behaviour,
      distractors: c.distractors,
      expected: c.expected,
      actual: report.shape,
      matched: report.shape === c.expected,
      why: c.why
    });
  }

  const shapeOf = (b: SyntheticBehaviour, d: boolean): DegradationShape | undefined =>
    results.find((r) => r.behaviour === b && r.distractors === d)?.actual;
  // The axis is live only if turning it on moves the shape-matcher and does not
  // move the value-reader. Either half alone is satisfied by a broken axis: one
  // that changes nothing, or one that simply corrupts the context for everyone.
  const distractorAxisIsLive =
    shapeOf("distractible", true) !== "no_degradation_detected" &&
    shapeOf("perfect", true) === "no_degradation_detected";

  const failed = results.filter((r) => !r.matched);
  const distinct = new Set(results.map((r) => r.actual)).size;
  const passed = failed.length === 0 && distractorAxisIsLive;
  const detail = passed
    ? `all ${results.length} controls classified as expected across ${distinct} distinct shapes; the distractor axis moves a shape-matcher and not a value-reader`
    : [
        ...failed.map(
          (r) =>
            `${r.behaviour}${r.distractors ? "+distractors" : ""}: expected ${r.expected}, got ${r.actual} — ${r.why}`
        ),
        ...(distractorAxisIsLive ? [] : ["the distractor axis changed nothing, or changed everything: it measures nothing"])
      ].join("; ");

  return { results, distractor_axis_is_live: distractorAxisIsLive, passed, detail };
}

export function formatSelfCheck(check: SelfCheck): string {
  const rows = check.results.map((r) => {
    const name = `${r.behaviour}${r.distractors ? " +distractors" : ""}`.padEnd(24);
    return `  ${r.matched ? "ok  " : "FAIL"} ${name} ${r.actual}`;
  });
  return `${rows.join("\n")}\n  → ${check.passed ? "controls separated" : "PROBE NOT TRUSTWORTHY"}: ${check.detail}`;
}

export function formatDegradation(report: DegradationReport): string {
  const sizes = [...new Set(report.cells.map((c) => c.size_tokens))].sort((a, b) => a - b);
  const depths = [...new Set(report.cells.map((c) => c.depth))].sort((a, b) => a - b);
  const header = `  depth→ ${depths.map((d) => d.toFixed(2).padStart(6)).join("")}`;
  const rows = sizes.map((s) => {
    const marks = depths.map((d) => {
      const cell = report.cells.find((c) => c.size_tokens === s && c.depth === d);
      return (cell?.recalled === true ? "ok" : "MISS").padStart(6);
    });
    return `  ${String(s).padStart(7)}tok${marks.join("")}`;
  });
  return `${header}\n${rows.join("\n")}\n  → ${report.shape}: ${report.detail}`;
}
