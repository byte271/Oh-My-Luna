import type { PricingEvidence } from "../types.js";

/**
 * Cost reconstruction for the gpt-5.6 family, derived only from the committed
 * pricing evidence under `data/pricing/`.
 *
 * The two rules below come from the captured model page
 * (`gpt-5.6-luna-model-2026-08-02.md`, sha256
 * 5e88a153...e7635a69) and are reproduced here rather than inferred:
 *
 *   - prompts above the long-context threshold are billed at 2x input and
 *     1.5x output for the whole request;
 *   - cache writes are billed at 1.25x the uncached input rate.
 *
 * The evidence records the long-context multipliers as a separate rate tier,
 * so this module reads the tier rather than recomputing the multipliers.
 */

/** Input-token count above which the long-context tier applies. */
export const LONG_CONTEXT_THRESHOLD_TOKENS = 272_000;

export interface ProviderUsage {
  readonly input_tokens: number;
  readonly cached_input_tokens: number;
  readonly cache_write_tokens: number;
  readonly output_tokens: number;
}

export interface CostBreakdown {
  readonly token_cost_usd: number;
  readonly long_context_applied: boolean;
  /**
   * `reconstructed` when every component was computed from provider-reported
   * token counts and committed rates. Never `exact_provider_reported`: the
   * provider response does not carry a billed amount, so an exact figure
   * cannot be reconstructed from it.
   */
  readonly accuracy: "reconstructed" | "estimated";
  readonly omitted_charge_categories: string[];
}

const PER_MILLION = 1_000_000;

/**
 * Computes token cost from provider-reported usage.
 *
 * `estimated` is returned when any component had to be assumed rather than
 * read from the provider response — notably cache-write tokens, which are not
 * reported separately by every response shape.
 */
export function computeTokenCost(
  usage: ProviderUsage,
  evidence: PricingEvidence,
  model: string,
  options: { cacheWriteReported: boolean }
): CostBreakdown {
  const rates = evidence.extracted[model];
  if (!rates) {
    throw new Error(`No committed pricing evidence for model ${model}`);
  }

  const longContext = usage.input_tokens > LONG_CONTEXT_THRESHOLD_TOKENS;
  const tier = longContext ? rates.long_context : rates.short_context;

  // Cached input is a subset of input tokens and is billed at the cached rate;
  // the remainder is billed at the uncached rate.
  const uncachedInput = Math.max(0, usage.input_tokens - usage.cached_input_tokens);

  const cost =
    (uncachedInput * tier.input +
      usage.cached_input_tokens * tier.cached_input +
      usage.cache_write_tokens * tier.cache_write +
      usage.output_tokens * tier.output) /
    PER_MILLION;

  return {
    token_cost_usd: cost,
    long_context_applied: longContext,
    accuracy: options.cacheWriteReported ? "reconstructed" : "estimated",
    omitted_charge_categories: [
      ...evidence.omissions,
      ...(options.cacheWriteReported ? [] : ["cache_write_tokens_not_reported_by_provider_response"])
    ]
  };
}

/**
 * Conservative pre-flight estimate used for budget reservation.
 *
 * Deliberately pessimistic: it assumes no cache hits and that the output
 * budget is spent in full, so the guard reserves at least what the request can
 * actually cost.
 */
export function estimateRequestCost(
  promptTokens: number,
  maxOutputTokens: number,
  evidence: PricingEvidence,
  model: string
): number {
  return computeTokenCost(
    {
      input_tokens: promptTokens,
      cached_input_tokens: 0,
      cache_write_tokens: 0,
      output_tokens: maxOutputTokens
    },
    evidence,
    model,
    { cacheWriteReported: false }
  ).token_cost_usd;
}
