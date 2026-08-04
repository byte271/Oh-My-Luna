import type { BillingRecord, TokenRates, TokenUsage } from "./types.js";

export function calculateCostUsd(usage: TokenUsage, rates: TokenRates): number {
  const uncached = Math.max(0, usage.input_tokens - usage.cached_input_tokens);
  const total = uncached * rates.input + usage.cached_input_tokens * rates.cached_input + usage.output_tokens * rates.output;
  return Number((total / 1_000_000).toFixed(9));
}

export function totalBillingCost(records: BillingRecord[]): number {
  return Number(records.reduce((sum, record) => sum + record.total_cost_usd, 0).toFixed(9));
}
