import { createHash } from "node:crypto";
import { OmlError } from "../errors.js";
import type { ModelAdapter, ModelAdapterResult } from "../model-adapter.js";
import type { ModelRequest, ModelResponse, PricingEvidence, ProcessResult } from "../types.js";
import { BudgetGuard, type BudgetLimits } from "./budget.js";
import { computeTokenCost, estimateRequestCost, type ProviderUsage } from "./openai-cost.js";

/**
 * Live provider adapter for the gpt-5.6 family.
 *
 * LIVE EXECUTION IS BLOCKED BY DEFAULT, for two independent reasons, and each
 * must be cleared separately:
 *
 *  1. No credential. The adapter never reads a key from source and never logs
 *     one; it is supplied at construction by the operator.
 *
 *  2. No verified wire contract. The provider's API documentation could not be
 *     retrieved in the environment where this was written — the network policy
 *     denied `developers.openai.com` (CONNECT 403). The endpoint path, request
 *     body shape, reasoning-effort values, snapshot-pinned model identifiers
 *     and the exact usage field names are therefore NOT verified against
 *     current official documentation, and this file does not pretend otherwise.
 *     `transport` is an injected seam precisely so that the unverified part is
 *     one small, replaceable function rather than assumptions spread through
 *     the adapter.
 *
 * What IS verified and safe to rely on: the cost model, which is computed only
 * from the committed pricing evidence under `data/pricing/`, whose hashes are
 * checked on load.
 *
 * To enable live execution an operator must pass `documentationVerified: true`,
 * which is an explicit attestation that the transport has been checked against
 * current official documentation. Nothing in the codebase can establish that on
 * its own.
 */

/** Everything the adapter records for every request, per the research policy. */
export interface ProviderRequestRecord {
  readonly model_identifier: string;
  readonly requested_at: string;
  readonly reasoning: Readonly<Record<string, unknown>> | null;
  readonly prompt_sha256: string;
  readonly input_tokens: number;
  readonly cached_input_tokens: number;
  readonly cache_write_tokens: number;
  readonly output_tokens: number;
  readonly cache_write_reported: boolean;
  readonly tool_calls: ReadonlyArray<{ name: string; count: number }>;
  readonly retries: number;
  readonly provider_request_id: string | null;
  readonly service_tier: string | null;
  readonly token_cost_usd: number;
  readonly tool_cost_usd: number;
  readonly long_context_applied: boolean;
  readonly cost_accuracy: "reconstructed" | "estimated";
  readonly pricing_snapshot_id: string;
  readonly cost_limitations: readonly string[];
  readonly duration_ms: number;
}

/** Normalized result a transport must return. Deliberately minimal. */
export interface TransportResult {
  readonly text: string;
  readonly usage: ProviderUsage;
  /** False when the response shape does not report cache-write tokens. */
  readonly cache_write_reported: boolean;
  readonly provider_request_id: string | null;
  readonly service_tier: string | null;
  readonly tool_calls: ReadonlyArray<{ name: string; count: number }>;
}

export interface TransportRequest {
  readonly model: string;
  readonly prompt: string;
  readonly max_output_tokens: number;
  readonly reasoning: Readonly<Record<string, unknown>> | null;
  readonly signal?: AbortSignal | undefined;
  readonly timeout_ms: number;
}

export type Transport = (request: TransportRequest, apiKey: string) => Promise<TransportResult>;

export interface OpenAiAdapterOptions {
  /** Snapshot-pinned identifier where the operator has one; otherwise the family id. */
  readonly model: string;
  readonly pricing: PricingEvidence;
  readonly pricingSnapshotId: string;
  readonly budget: BudgetLimits;
  readonly maxOutputTokens: number;
  readonly timeoutMs: number;
  readonly reasoning?: Readonly<Record<string, unknown>> | null;
  readonly maxRetries?: number;
  /**
   * Operator attestation that `transport` matches current official
   * documentation. Live execution is refused without it.
   */
  readonly documentationVerified: boolean;
  readonly transport: Transport;
  /** Supplied by the operator at run time. Never read from source or logged. */
  readonly apiKey?: string;
  readonly now?: () => Date;
}

const REDACTED = "[redacted]";

/**
 * Removes anything key-shaped from text that may reach a log or a receipt.
 *
 * Two layers, because they fail differently. The exact-substring pass is the one
 * that matters and is exhaustive for the key actually in use; the pattern pass is
 * a backstop for a credential this process was never handed — a key pasted into
 * an upstream error, or one belonging to a different account.
 *
 * The backstop previously anchored on `\b`, which does not match between two word
 * characters, so a key concatenated to a preceding token (`prefixsk-…`) survived
 * it. It also covered only `sk-` and `rk-`, leaving session tokens (`sess-`)
 * untouched. Both are narrow — the exact pass catches the live key regardless —
 * but a redactor's failure mode should be over-redaction, never under.
 *
 * Organization identifiers (`org-`) are deliberately NOT redacted: they are not
 * credentials, and blanking them would destroy the account context that makes a
 * billing dispute diagnosable.
 */
export function redactSecrets(text: string, apiKey?: string): string {
  let out = text;
  if (apiKey && apiKey.length > 0) out = out.split(apiKey).join(REDACTED);
  return out.replace(/(?:sk|rk|sess)-[A-Za-z0-9_-]{8,}/g, REDACTED);
}

export class OpenAiResponsesAdapter implements ModelAdapter {
  readonly #options: OpenAiAdapterOptions;
  readonly #guard: BudgetGuard;
  readonly #records: ProviderRequestRecord[] = [];

  constructor(options: OpenAiAdapterOptions) {
    this.#options = options;
    this.#guard = new BudgetGuard(options.budget);
  }

  get records(): readonly ProviderRequestRecord[] {
    return this.#records;
  }

  get budgetState() {
    return this.#guard.state;
  }

  async invoke(request: ModelRequest, signal?: AbortSignal): Promise<ModelAdapterResult> {
    const options = this.#options;
    if (!options.documentationVerified) {
      throw new OmlError(
        "OML_PROVIDER_LIVE_EXECUTION_BLOCKED",
        "Live execution is blocked: the transport has not been attested against current official provider documentation",
        { reason: "documentation_unverified" }
      );
    }
    if (!options.apiKey) {
      throw new OmlError("OML_PROVIDER_CREDENTIAL_MISSING", "No provider credential was supplied to the adapter");
    }

    const prompt = renderPrompt(request);
    const promptSha256 = createHash("sha256").update(prompt).digest("hex");
    // Reserve against a pessimistic estimate so the cap holds before the call.
    const promptTokenEstimate = estimateTokens(prompt);
    const estimate = estimateRequestCost(promptTokenEstimate, options.maxOutputTokens, options.pricing, options.model);
    this.#guard.reserve(estimate);

    const started = (options.now?.() ?? new Date()).toISOString();
    const startedAt = Date.now();
    let retries = 0;
    let result: TransportResult;
    for (;;) {
      try {
        result = await options.transport(
          {
            model: options.model,
            prompt,
            max_output_tokens: options.maxOutputTokens,
            reasoning: options.reasoning ?? null,
            signal,
            timeout_ms: options.timeoutMs
          },
          options.apiKey
        );
        break;
      } catch (error) {
        if (retries >= (options.maxRetries ?? 0)) {
          this.#guard.settle(estimate, 0);
          throw new OmlError("OML_ADAPTER_FAILED", "Provider transport failed", {
            retries,
            detail: redactSecrets(error instanceof Error ? error.message : String(error), options.apiKey)
          });
        }
        retries += 1;
      }
    }

    const cost = computeTokenCost(result.usage, options.pricing, options.model, {
      cacheWriteReported: result.cache_write_reported
    });
    const toolCost = computeToolCost(result.tool_calls, options.pricing);
    this.#guard.settle(estimate, cost.token_cost_usd + toolCost);

    const record: ProviderRequestRecord = {
      model_identifier: options.model,
      requested_at: started,
      reasoning: options.reasoning ?? null,
      prompt_sha256: promptSha256,
      input_tokens: result.usage.input_tokens,
      cached_input_tokens: result.usage.cached_input_tokens,
      cache_write_tokens: result.usage.cache_write_tokens,
      output_tokens: result.usage.output_tokens,
      cache_write_reported: result.cache_write_reported,
      tool_calls: result.tool_calls,
      retries,
      provider_request_id: result.provider_request_id,
      service_tier: result.service_tier,
      token_cost_usd: cost.token_cost_usd,
      tool_cost_usd: toolCost,
      long_context_applied: cost.long_context_applied,
      cost_accuracy: cost.accuracy,
      pricing_snapshot_id: options.pricingSnapshotId,
      cost_limitations: cost.omitted_charge_categories,
      duration_ms: Date.now() - startedAt
    };
    this.#records.push(record);

    const response: ModelResponse = {
      schema_version: "0.1",
      files: parseProposedFiles(result.text),
      claims: [],
      usage: {
        input_tokens: result.usage.input_tokens,
        cached_input_tokens: result.usage.cached_input_tokens,
        output_tokens: result.usage.output_tokens
      },
      billing: {
        // Never `exact_provider_reported`: the response carries token counts,
        // not a billed amount, so an exact figure cannot be reconstructed.
        accuracy: cost.accuracy,
        records: [
          {
            request_id: result.provider_request_id ?? "unreported",
            service_tier: result.service_tier ?? "unreported",
            input_tokens: result.usage.input_tokens,
            cached_input_tokens: result.usage.cached_input_tokens,
            cache_write_tokens: result.usage.cache_write_tokens,
            output_tokens: result.usage.output_tokens,
            long_context_applied: cost.long_context_applied,
            token_cost_usd: cost.token_cost_usd,
            tool_cost_usd: toolCost,
            // No specialist component exists in this arm.
            specialist_cost_usd: 0,
            total_cost_usd: cost.token_cost_usd + toolCost,
            // Token counts come from the provider; the dollar amount is
            // computed here from committed rates, so the source is
            // reconstruction rather than a provider-reported charge.
            source: "reconstructed"
          }
        ],
        omitted_charge_categories: cost.omitted_charge_categories
      }
    };

    const process: ProcessResult = {
      exitCode: 0,
      stdout: Buffer.from(""),
      stderr: Buffer.from(""),
      timedOut: false
    };

    return { response, process };
  }
}

function computeToolCost(
  calls: ReadonlyArray<{ name: string; count: number }>,
  evidence: PricingEvidence
): number {
  let total = 0;
  for (const call of calls) {
    const charge = evidence.tool_charges.find((entry) => entry.name === call.name);
    if (charge) total += charge.amount_usd * call.count;
  }
  return total;
}

function renderPrompt(request: ModelRequest): string {
  return JSON.stringify(request);
}

/**
 * Rough token estimate for budget reservation only, never for billing.
 * Deliberately over-estimates; four characters per token understates common
 * code, so a floor of one token per three characters is used.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3);
}

/**
 * Parses proposed files from model output. The transport is unverified, so the
 * expected envelope is checked strictly and a bad shape is an error rather than
 * a silent empty edit.
 */
export function parseProposedFiles(text: string): ModelResponse["files"] {
  const trimmed = text.trim();
  if (trimmed.length === 0) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new OmlError("OML_PROVIDER_RESPONSE_INVALID", "Provider output is not a JSON object");
  }
  if (typeof parsed !== "object" || parsed === null || !Array.isArray((parsed as { files?: unknown }).files)) {
    throw new OmlError("OML_PROVIDER_RESPONSE_INVALID", "Provider output has no files array");
  }
  return (parsed as { files: ModelResponse["files"] }).files;
}
