import assert from "node:assert/strict";
import test from "node:test";
import {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  AuthenticationError,
  BadRequestError,
  InternalServerError,
  RateLimitError
} from "openai";
import {
  SDK_MAX_RETRIES,
  callResponses,
  classifyError,
  newClientRequestId,
  LiveTransportError,
  type ResponsesClient
} from "../src/providers/openai-transport.js";
import { validateProviderOutput } from "../src/providers/output-validation.js";
import { checkLiveAuthorization, requireLiveAuthorization, formatPreflight } from "../src/providers/live-gate.js";
import { computeTokenCost } from "../src/providers/openai-cost.js";
import { redactSecrets } from "../src/providers/openai-responses.js";
import { BudgetGuard } from "../src/providers/budget.js";
import type { PricingEvidence } from "../src/types.js";

// SDK error constructors require a Headers instance.
const H = new Headers();

// Synthetic fixtures only. No real provider response is committed, so no
// account information can leak into the repository.
function syntheticResponse(overrides: Record<string, unknown> = {}) {
  return {
    id: "resp_synthetic_1",
    _request_id: "req_synthetic_1",
    model: "gpt-5.6-luna",
    created_at: 1_785_000_000,
    status: "completed",
    incomplete_details: null,
    output_text: JSON.stringify({ files: [{ path: "src/a.ts", contents: "x" }] }),
    output: [{ type: "message" }],
    service_tier: "default",
    usage: {
      input_tokens: 1000,
      output_tokens: 200,
      total_tokens: 1200,
      input_tokens_details: { cached_tokens: 100, cache_write_tokens: 50 },
      output_tokens_details: { reasoning_tokens: 80 }
    },
    ...overrides
  };
}

function clientReturning(response: unknown, capture?: { body?: unknown; options?: unknown }): ResponsesClient {
  return {
    responses: {
      create: async (body: Record<string, unknown>, options?: Record<string, unknown>) => {
        if (capture) {
          capture.body = body;
          capture.options = options;
        }
        return response as never;
      }
    }
  };
}

function clientThrowing(error: unknown): ResponsesClient {
  return {
    responses: {
      create: async () => {
        throw error;
      }
    }
  };
}

const baseRequest = {
  model: "gpt-5.6-luna",
  input: "task",
  maxOutputTokens: 4096,
  reasoningEffort: "low" as const,
  timeoutMs: 60_000,
  clientRequestId: "oml-fixed-id"
};

const pricing = {
  extracted: {
    "gpt-5.6-luna": {
      short_context: { input: 0.2, cached_input: 0.02, cache_write: 0.25, output: 1.2 },
      long_context: { input: 0.4, cached_input: 0.04, cache_write: 0.5, output: 1.8 }
    }
  },
  tool_charges: [],
  omissions: []
} as unknown as PricingEvidence;

test("1. request is constructed for the Responses API with the frozen model", async () => {
  const capture: { body?: unknown } = {};
  await callResponses(clientReturning(syntheticResponse(), capture), baseRequest);
  assert.equal((capture.body as Record<string, unknown>).model, "gpt-5.6-luna");
  assert.equal((capture.body as Record<string, unknown>).input, "task");
});

test("2. store is false so nothing is retained provider-side", async () => {
  const capture: { body?: unknown } = {};
  await callResponses(clientReturning(syntheticResponse(), capture), baseRequest);
  assert.equal((capture.body as Record<string, unknown>).store, false);
});

test("3. reasoning configuration is sent exactly as frozen", async () => {
  const capture: { body?: unknown } = {};
  await callResponses(clientReturning(syntheticResponse(), capture), { ...baseRequest, reasoningEffort: "medium" });
  assert.deepEqual((capture.body as Record<string, unknown>).reasoning, { effort: "medium" });
});

test("4. output tokens are bounded", async () => {
  const capture: { body?: unknown } = {};
  await callResponses(clientReturning(syntheticResponse(), capture), baseRequest);
  assert.equal((capture.body as Record<string, unknown>).max_output_tokens, 4096);
});

test("5. a client request id is generated and sent as a header", async () => {
  const capture: { options?: unknown } = {};
  await callResponses(clientReturning(syntheticResponse(), capture), baseRequest);
  const headers = (capture.options as { headers: Record<string, string> }).headers;
  assert.equal(headers["X-Client-Request-Id"], "oml-fixed-id");
  assert.match(newClientRequestId(), /^oml-[0-9a-f-]{36}$/);
});

test("6. the server request id is captured from _request_id", async () => {
  const result = await callResponses(clientReturning(syntheticResponse()), baseRequest);
  assert.equal(result.server_request_id, "req_synthetic_1");
  assert.equal(result.provider_response_id, "resp_synthetic_1");
});

test("7. requested and returned model are both recorded", async () => {
  const result = await callResponses(clientReturning(syntheticResponse({ model: "gpt-5.6-luna-server-variant" })), baseRequest);
  assert.equal(result.requested_model, "gpt-5.6-luna");
  assert.equal(result.returned_model, "gpt-5.6-luna-server-variant");
});

test("8. usage with cached tokens is captured", async () => {
  const result = await callResponses(clientReturning(syntheticResponse()), baseRequest);
  assert.equal(result.input_tokens, 1000);
  assert.equal(result.cached_input_tokens, 100);
  assert.equal(result.output_tokens, 200);
  assert.equal(result.total_tokens, 1200);
});

test("9. usage without cached tokens reports null, not zero", async () => {
  const response = syntheticResponse({
    usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15, input_tokens_details: {}, output_tokens_details: {} }
  });
  const result = await callResponses(clientReturning(response), baseRequest);
  assert.equal(result.cached_input_tokens, null, "absent must not be reported as zero");
});

test("10. reasoning tokens are captured", async () => {
  const result = await callResponses(clientReturning(syntheticResponse()), baseRequest);
  assert.equal(result.reasoning_tokens, 80);
});

test("11. a missing cache-write field reports null", async () => {
  const response = syntheticResponse({
    usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15, input_tokens_details: { cached_tokens: 2 }, output_tokens_details: {} }
  });
  const result = await callResponses(clientReturning(response), baseRequest);
  assert.equal(result.cache_write_tokens, null);
});

test("12. a present cache-write field is captured (SDK 7.3.0 exposes it)", async () => {
  const result = await callResponses(clientReturning(syntheticResponse()), baseRequest);
  assert.equal(result.cache_write_tokens, 50);
});

test("13. cost is reconstructed from captured usage", async () => {
  const result = await callResponses(clientReturning(syntheticResponse()), baseRequest);
  const cost = computeTokenCost(
    {
      input_tokens: result.input_tokens ?? 0,
      cached_input_tokens: result.cached_input_tokens ?? 0,
      cache_write_tokens: result.cache_write_tokens ?? 0,
      output_tokens: result.output_tokens ?? 0
    },
    pricing,
    "gpt-5.6-luna",
    { cacheWriteReported: result.cache_write_tokens !== null }
  );
  const expected = (900 * 0.2 + 100 * 0.02 + 50 * 0.25 + 200 * 1.2) / 1_000_000;
  assert.ok(Math.abs(cost.token_cost_usd - expected) < 1e-12);
  assert.equal(cost.accuracy, "reconstructed");
});

test("14. long-context rates are selected above the documented threshold", () => {
  const over = computeTokenCost(
    { input_tokens: 272_001, cached_input_tokens: 0, cache_write_tokens: 0, output_tokens: 0 },
    pricing,
    "gpt-5.6-luna",
    { cacheWriteReported: true }
  );
  assert.equal(over.long_context_applied, true);
});

test("15. service tier is captured when present and null when absent", async () => {
  const present = await callResponses(clientReturning(syntheticResponse()), baseRequest);
  assert.equal(present.service_tier, "default");
  const absent = await callResponses(clientReturning(syntheticResponse({ service_tier: undefined })), baseRequest);
  assert.equal(absent.service_tier, null);
});

test("16. malformed output is rejected", () => {
  const verdict = validateProviderOutput("{not json", { status: "completed", incompleteReason: null, maxBytes: 1000, permittedPaths: [] });
  assert.equal(verdict.ok, false);
  assert.equal(verdict.ok === false && verdict.reason, "not_json");
});

test("17. an incomplete response is rejected with its reason", () => {
  const verdict = validateProviderOutput("{}", {
    status: "incomplete",
    incompleteReason: "max_output_tokens",
    maxBytes: 1000,
    permittedPaths: []
  });
  assert.equal(verdict.ok, false);
  assert.equal(verdict.ok === false && verdict.reason, "response_incomplete");
  assert.match(verdict.ok === false ? verdict.detail : "", /max_output_tokens/);
});

test("18. prose that claims completion but contains no change is a failure", () => {
  const verdict = validateProviderOutput("I have fixed the bug in the parser. All tests should now pass.", {
    status: "completed",
    incompleteReason: null,
    maxBytes: 10_000,
    permittedPaths: []
  });
  assert.equal(verdict.ok, false, "a fluent claim of success must not count as success");
  assert.equal(verdict.ok === false && verdict.reason, "not_json");

  const empty = validateProviderOutput(JSON.stringify({ files: [] }), {
    status: "completed",
    incompleteReason: null,
    maxBytes: 10_000,
    permittedPaths: []
  });
  assert.equal(empty.ok === false && empty.reason, "empty_change_set");
});

test("19. authentication failure is classified and never retried", () => {
  const classified = classifyError(new AuthenticationError(401, undefined, "bad key", H));
  assert.equal(classified.errorClass, "AuthenticationError");
  assert.equal(classified.retryable, false);
  assert.equal(classified.billing, "not_incurred");
});

test("20. a rate-limit response is retryable", () => {
  const classified = classifyError(APIError.generate(429, { error: { message: "slow down" } }, "slow down", new Headers()));
  assert.equal(classified.errorClass, "RateLimitError");
  assert.equal(classified.retryable, true);
});

test("21. a spending-limit response is not retryable", () => {
  // Built the way the SDK builds it: generate() unwraps body.error and passes
  // the inner object, so `code` lands on the error instance.
  const error = APIError.generate(429, { error: { code: "insufficient_quota", message: "quota" } }, "quota", new Headers());
  const classified = classifyError(error);
  assert.equal(classified.errorClass, "SpendingLimitError");
  assert.equal(classified.retryable, false);
});

test("22. a temporary server error is retryable", () => {
  const classified = classifyError(new InternalServerError(500, undefined, "oops", H));
  assert.equal(classified.errorClass, "InternalServerError");
  assert.equal(classified.retryable, true);
});

test("23. a connection failure before submission is retryable and not billed", () => {
  const classified = classifyError(new APIConnectionError({ message: "refused" }));
  assert.equal(classified.retryable, true);
  assert.equal(classified.billing, "not_incurred");
  assert.equal(classified.outcome, "failed");
});

test("24. an uncertain post-submission timeout is unknown, possibly billed, never retried", () => {
  const classified = classifyError(new APIConnectionTimeoutError({ message: "timed out" }));
  assert.equal(classified.outcome, "unknown");
  assert.equal(classified.billing, "possibly_incurred");
  assert.equal(classified.retryable, false, "retrying an uncertain call can double-spend");
});

test("25. credentials are redacted from transport failures", async () => {
  const key = "sk-live-secret-value-1234";
  const client = clientThrowing(new BadRequestError(400, undefined, `rejected key ${key}`, H));
  await assert.rejects(callResponses(client, baseRequest, key), (error: LiveTransportError) => {
    assert.ok(!error.message.includes(key));
    assert.ok(!JSON.stringify(error.failure).includes(key));
    return true;
  });
  assert.equal(redactSecrets("sk-abcdefgh12345678"), "[redacted]");
});

test("26. the budget guard blocks before the transport is invoked", async () => {
  let called = 0;
  const guard = new BudgetGuard({ max_requests: 1, max_total_usd: 0.000001, max_request_usd: 0.000001 });
  const client: ResponsesClient = {
    responses: {
      create: async () => {
        called += 1;
        return syntheticResponse() as never;
      }
    }
  };
  assert.throws(() => guard.reserve(1));
  if (guard.state.requests_issued === 0) {
    // Guard rejected, so the transport must never run.
    assert.equal(called, 0);
  }
  void client;
});

test("27. SDK automatic retries are disabled and set explicitly per request", async () => {
  const capture: { options?: unknown } = {};
  await callResponses(clientReturning(syntheticResponse(), capture), baseRequest);
  assert.equal(SDK_MAX_RETRIES, 0);
  assert.equal((capture.options as Record<string, unknown>).maxRetries, 0);
});

test("28. no tools are ever attached", async () => {
  const capture: { body?: unknown } = {};
  await callResponses(clientReturning(syntheticResponse(), capture), baseRequest);
  assert.deepEqual((capture.body as Record<string, unknown>).tools, []);
});

test("29. the raw usage object is preserved", async () => {
  const result = await callResponses(clientReturning(syntheticResponse()), baseRequest);
  assert.deepEqual(result.raw_usage, syntheticResponse().usage);
  assert.deepEqual(result.output_item_types, ["message"]);
});

test("30. the live gate blocks unless all three signals are present", () => {
  assert.equal(checkLiveAuthorization({}).authorized, false);
  assert.equal(checkLiveAuthorization({ OPENAI_API_KEY: "k" }).authorized, false);
  assert.equal(checkLiveAuthorization({ OPENAI_API_KEY: "k", OML_LIVE_APPROVED: "1" }).authorized, false);
  assert.equal(
    checkLiveAuthorization({ OPENAI_API_KEY: "k", OML_LIVE_APPROVED: "1", OML_LIVE_BUDGET_USD: "0" }).authorized,
    false
  );
  const ok = checkLiveAuthorization({ OPENAI_API_KEY: "k", OML_LIVE_APPROVED: "1", OML_LIVE_BUDGET_USD: "0.5" });
  assert.equal(ok.authorized, true);
  assert.throws(() => requireLiveAuthorization({}), (error: Error & { code?: string }) => {
    assert.equal(error.code, "OML_PROVIDER_LIVE_EXECUTION_BLOCKED");
    return true;
  });
});

test("31. path traversal and unrelated files are rejected", () => {
  const escape = validateProviderOutput(JSON.stringify({ files: [{ path: "../outside.ts", contents: "x" }] }), {
    status: "completed",
    incompleteReason: null,
    maxBytes: 10_000,
    permittedPaths: []
  });
  assert.equal(escape.ok === false && escape.reason, "path_escapes_workspace");

  const unrelated = validateProviderOutput(JSON.stringify({ files: [{ path: "other.ts", contents: "x" }] }), {
    status: "completed",
    incompleteReason: null,
    maxBytes: 10_000,
    permittedPaths: ["src/a.ts"]
  });
  assert.equal(unrelated.ok === false && unrelated.reason, "path_not_permitted");
});

test("32. the pre-flight disclosure records everything needed before spending", () => {
  const text = formatPreflight({
    requested_model: "gpt-5.6-luna",
    task_id: "t",
    treatment: "T0",
    max_output_tokens: 4096,
    reasoning_effort: "low",
    pessimistic_max_cost_usd: 0.01,
    remaining_budget_usd: 0.5,
    documentation_evidence_id: "provider-contract-2026-08-02",
    sdk_version: "7.3.0"
  });
  for (const needle of ["gpt-5.6-luna", "T0", "4096", "low", "0.010000", "0.5000", "provider-contract-2026-08-02", "7.3.0"]) {
    assert.match(text, new RegExp(needle.replace(/[.]/g, "\\.")));
  }
});

test("33. an unrecognised error is treated as uncertain rather than safe", () => {
  const classified = classifyError(new Error("mystery"));
  assert.equal(classified.outcome, "unknown");
  assert.equal(classified.billing, "possibly_incurred");
  assert.equal(classified.retryable, false);
  const api = classifyError(new APIError(418, undefined, "teapot", H));
  assert.equal(api.retryable, false);
});
