import { randomUUID } from "node:crypto";
import OpenAI, {
  APIConnectionTimeoutError,
  APIConnectionError,
  APIError,
  AuthenticationError,
  BadRequestError,
  PermissionDeniedError,
  RateLimitError,
  InternalServerError
} from "openai";
import type { Response as OpenAIResponse } from "openai/resources/responses/responses";
import { redactSecrets } from "./openai-responses.js";

/**
 * Live transport for the OpenAI Responses API.
 *
 * Built against the exact installed SDK (openai@7.3.0) rather than an
 * approximation of the wire format. Everything it relies on is recorded in
 * `data/provider-evidence/manifest.json`:
 *
 *   - `gpt-5.6-luna` is a member of the SDK's ResponsesModel union, and that
 *     union carries no dated snapshot for it, so the model is treated as a
 *     mutable alias and never described as pinned.
 *   - Usage arrives as input_tokens / output_tokens / total_tokens with
 *     input_tokens_details.{cached_tokens,cache_write_tokens} and
 *     output_tokens_details.reasoning_tokens.
 *   - The server request id is exposed as `_request_id`, taken from the
 *     x-request-id header.
 *   - SDK auto-retry defaults to 2 and is set to 0 here.
 *
 * Missing values are reported as null, never coerced to zero: for token
 * accounting "absent" and "zero" are different facts.
 */

/** SDK auto-retries are disabled so one attempt is one provider submission. */
export const SDK_MAX_RETRIES = 0;

export const SDK_VERSION = "7.3.0";

export type TokenValue = number | null;

export interface LiveTransportRequest {
  readonly model: string;
  readonly input: string;
  readonly instructions?: string | undefined;
  readonly maxOutputTokens: number;
  readonly reasoningEffort: "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
  readonly timeoutMs: number;
  readonly clientRequestId: string;
  readonly signal?: AbortSignal | undefined;
}

/** Everything §4.5 requires captured, with absence distinguished from zero. */
export interface LiveTransportResult {
  readonly provider_response_id: string | null;
  readonly server_request_id: string | null;
  readonly client_request_id: string;
  readonly requested_model: string;
  readonly returned_model: string | null;
  readonly created_at: number | null;
  readonly status: string | null;
  readonly incomplete_reason: string | null;
  readonly output_text: string;
  readonly output_item_types: readonly string[];
  readonly input_tokens: TokenValue;
  readonly cached_input_tokens: TokenValue;
  readonly cache_write_tokens: TokenValue;
  readonly output_tokens: TokenValue;
  readonly reasoning_tokens: TokenValue;
  readonly total_tokens: TokenValue;
  readonly service_tier: string | null;
  readonly duration_ms: number;
  readonly raw_usage: unknown;
}

export type ProviderOutcome = "completed" | "failed" | "unknown";

export interface LiveTransportFailure {
  readonly outcome: ProviderOutcome;
  readonly billing_status: "not_incurred" | "possibly_incurred" | "incurred";
  readonly error_class: string;
  readonly status_code: number | null;
  readonly server_request_id: string | null;
  readonly client_request_id: string;
  readonly retryable: boolean;
  readonly message: string;
  readonly duration_ms: number;
}

export class LiveTransportError extends Error {
  readonly failure: LiveTransportFailure;
  constructor(failure: LiveTransportFailure) {
    super(failure.message);
    this.name = "LiveTransportError";
    this.failure = failure;
  }
}

export function newClientRequestId(): string {
  return `oml-${randomUUID()}`;
}

/**
 * Classifies a provider failure.
 *
 * `retryable` is advisory only — this transport never retries on its own.
 * Anything ambiguous about whether the provider actually received the request
 * is deliberately NOT retryable, because a duplicate submission would spend
 * money twice for one intended call.
 */
export function classifyError(error: unknown): {
  errorClass: string;
  statusCode: number | null;
  retryable: boolean;
  outcome: ProviderOutcome;
  billing: LiveTransportFailure["billing_status"];
} {
  if (error instanceof APIConnectionTimeoutError) {
    // The request may or may not have reached the provider. Never retry.
    return { errorClass: "APIConnectionTimeoutError", statusCode: null, retryable: false, outcome: "unknown", billing: "possibly_incurred" };
  }
  if (error instanceof APIConnectionError) {
    // Connection refused/reset before a response; treated as pre-submission.
    return { errorClass: "APIConnectionError", statusCode: null, retryable: true, outcome: "failed", billing: "not_incurred" };
  }
  if (error instanceof AuthenticationError) {
    return { errorClass: "AuthenticationError", statusCode: 401, retryable: false, outcome: "failed", billing: "not_incurred" };
  }
  if (error instanceof PermissionDeniedError) {
    return { errorClass: "PermissionDeniedError", statusCode: 403, retryable: false, outcome: "failed", billing: "not_incurred" };
  }
  if (error instanceof RateLimitError) {
    // Includes quota and spending-limit responses; distinguished by code below.
    const code = (error as APIError).code ?? null;
    const spendingLimited = code === "insufficient_quota" || code === "billing_hard_limit_reached";
    return {
      errorClass: spendingLimited ? "SpendingLimitError" : "RateLimitError",
      statusCode: 429,
      retryable: !spendingLimited,
      outcome: "failed",
      billing: "not_incurred"
    };
  }
  if (error instanceof BadRequestError) {
    return { errorClass: "BadRequestError", statusCode: 400, retryable: false, outcome: "failed", billing: "not_incurred" };
  }
  if (error instanceof InternalServerError) {
    return { errorClass: "InternalServerError", statusCode: (error as APIError).status ?? 500, retryable: true, outcome: "failed", billing: "not_incurred" };
  }
  if (error instanceof APIError) {
    return { errorClass: error.constructor.name, statusCode: error.status ?? null, retryable: false, outcome: "failed", billing: "not_incurred" };
  }
  return { errorClass: "UnknownError", statusCode: null, retryable: false, outcome: "unknown", billing: "possibly_incurred" };
}

/** Reads a numeric field, preserving the difference between absent and zero. */
function tokenValue(value: unknown): TokenValue {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export interface ResponsesClient {
  responses: {
    create: (
      body: Record<string, unknown>,
      options?: Record<string, unknown>
    ) => Promise<OpenAIResponse & { _request_id?: string | null }>;
  };
}

export function createClient(apiKey: string, timeoutMs: number): ResponsesClient {
  return new OpenAI({
    apiKey,
    timeout: timeoutMs,
    // One attempt is one provider submission. The SDK default of 2 would hide
    // extra billable submissions behind a single call.
    maxRetries: SDK_MAX_RETRIES
  }) as unknown as ResponsesClient;
}

/**
 * Issues exactly one Responses API request.
 *
 * No tools are ever attached and `store` is false, so nothing is retained
 * provider-side and no built-in tool can be billed.
 */
export async function callResponses(
  client: ResponsesClient,
  request: LiveTransportRequest,
  apiKey?: string
): Promise<LiveTransportResult> {
  const startedAt = Date.now();
  try {
    const body: Record<string, unknown> = {
      model: request.model,
      input: request.input,
      max_output_tokens: request.maxOutputTokens,
      reasoning: { effort: request.reasoningEffort },
      // Never retain the request or response provider-side.
      store: false,
      // Explicitly empty: no built-in tool may activate or be charged.
      tools: []
    };
    if (request.instructions !== undefined) body.instructions = request.instructions;

    const options: Record<string, unknown> = {
      maxRetries: SDK_MAX_RETRIES,
      timeout: request.timeoutMs,
      headers: { "X-Client-Request-Id": request.clientRequestId }
    };
    if (request.signal) options.signal = request.signal;

    const response = await client.responses.create(body, options);
    const usage = response.usage as
      | (OpenAIResponse["usage"] & {
          input_tokens_details?: { cached_tokens?: number; cache_write_tokens?: number };
          output_tokens_details?: { reasoning_tokens?: number };
        })
      | undefined;

    return {
      provider_response_id: response.id ?? null,
      server_request_id: response._request_id ?? null,
      client_request_id: request.clientRequestId,
      requested_model: request.model,
      returned_model: response.model ?? null,
      created_at: typeof response.created_at === "number" ? response.created_at : null,
      status: response.status ?? null,
      incomplete_reason: response.incomplete_details?.reason ?? null,
      output_text: typeof response.output_text === "string" ? response.output_text : "",
      output_item_types: Array.isArray(response.output) ? response.output.map((item) => item.type) : [],
      input_tokens: tokenValue(usage?.input_tokens),
      cached_input_tokens: tokenValue(usage?.input_tokens_details?.cached_tokens),
      cache_write_tokens: tokenValue(usage?.input_tokens_details?.cache_write_tokens),
      output_tokens: tokenValue(usage?.output_tokens),
      reasoning_tokens: tokenValue(usage?.output_tokens_details?.reasoning_tokens),
      total_tokens: tokenValue(usage?.total_tokens),
      service_tier: (response as { service_tier?: string | null }).service_tier ?? null,
      duration_ms: Date.now() - startedAt,
      raw_usage: usage ?? null
    };
  } catch (error) {
    const classified = classifyError(error);
    throw new LiveTransportError({
      outcome: classified.outcome,
      billing_status: classified.billing,
      error_class: classified.errorClass,
      status_code: classified.statusCode,
      server_request_id: error instanceof APIError ? (error.requestID ?? null) : null,
      client_request_id: request.clientRequestId,
      retryable: classified.retryable,
      message: redactSecrets(error instanceof Error ? error.message : String(error), apiKey),
      duration_ms: Date.now() - startedAt
    });
  }
}
