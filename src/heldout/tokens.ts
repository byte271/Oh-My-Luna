/**
 * Token estimation.
 *
 * No tokenizer is vendored, so every figure here is an estimate and is labelled
 * as one. Two estimators exist because they answer different questions and
 * must not be interchanged.
 *
 * The repository previously used two *undeclared* and mutually inconsistent
 * estimates: `scripts/gate-h/forecast-cost.mjs` assumed 18,000–21,000 input
 * tokens per request against an actual assembled prompt of roughly 400, and
 * `run-stage-a.mjs` reserved budget on `prompt.length / 3`. The first was wrong
 * by ~45x; the second is a *character* count, which under-counts badly for
 * non-Latin text where one UTF-8 character costs two to four bytes and roughly
 * one token.
 */

/**
 * Neutral estimate, used wherever two quantities must be *compared* (source
 * size against an output cap, prompt size across arms).
 *
 * Roughly four bytes per token holds for English prose and Latin-script source
 * code. It is not conservative in either direction; do not use it to reserve
 * money.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(Buffer.byteLength(text, "utf8") / 4);
}

/**
 * Deliberately pessimistic estimate, used only for pre-flight budget
 * reservation.
 *
 * Two bytes per token over-states cost for ASCII by about 2x and stays at or
 * above the true count for CJK and other multi-byte scripts, where the neutral
 * estimator under-states. A budget guard that under-reserves is a guard that
 * does not hold, so this direction is chosen on purpose: the run refuses early
 * rather than discovering an overspend after the money is gone.
 */
export function estimateTokensConservative(text: string): number {
  return Math.ceil(Buffer.byteLength(text, "utf8") / 2);
}

/**
 * Tokens the model must emit to satisfy the whole-file output contract.
 *
 * The model returns `{"files":[{"path":…,"contents":…}]}`, so the billed and
 * capped quantity is the *JSON-encoded* envelope, not the raw source. Escaping
 * quotes, backslashes and newlines measurably inflates it — 3.2% to 6.4% on
 * this corpus — and a multi-file task must emit every permitted file in one
 * response. Comparing raw per-file source against the cap, as the first version
 * of the completeness check did, under-reports both effects.
 */
export function estimateChangeSetTokens(files: readonly { path: string; contents: string }[]): number {
  return estimateTokens(JSON.stringify({ files }));
}
