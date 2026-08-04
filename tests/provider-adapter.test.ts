import assert from "node:assert/strict";
import test from "node:test";
import { BudgetGuard } from "../src/providers/budget.js";
import { computeTokenCost, estimateRequestCost, LONG_CONTEXT_THRESHOLD_TOKENS } from "../src/providers/openai-cost.js";
import {
  OpenAiResponsesAdapter,
  estimateTokens,
  parseProposedFiles,
  redactSecrets,
  type Transport,
  type TransportResult
} from "../src/providers/openai-responses.js";
import type { ModelRequest, PricingEvidence } from "../src/types.js";

// Rates match the committed evidence for gpt-5.6-luna so the arithmetic below
// is checkable by hand against data/pricing/.
const pricing = {
  schema_version: "0.1",
  evidence_id: "test-pricing",
  service_tier: "standard",
  extracted: {
    "gpt-5.6-luna": {
      short_context: { input: 0.2, cached_input: 0.02, cache_write: 0.25, output: 1.2 },
      long_context: { input: 0.4, cached_input: 0.04, cache_write: 0.5, output: 1.8 }
    }
  },
  tool_charges: [{ name: "web_search_all_models", amount_usd: 0.01, unit: "per_call" }],
  omissions: ["storage"],
  limitations: []
} as unknown as PricingEvidence;

const request = { schema_version: "0.1", task: { id: "t", issue: "i" } } as unknown as ModelRequest;

function transportReturning(result: Partial<TransportResult>): Transport {
  return async () => ({
    text: JSON.stringify({ files: [] }),
    usage: { input_tokens: 1000, cached_input_tokens: 0, cache_write_tokens: 0, output_tokens: 500 },
    cache_write_reported: true,
    provider_request_id: "req_1",
    service_tier: "standard",
    tool_calls: [],
    ...result
  });
}

const baseOptions = {
  model: "gpt-5.6-luna",
  pricing,
  pricingSnapshotId: "openai-2026-08-02",
  budget: { max_requests: 10, max_total_usd: 1, max_request_usd: 0.5 },
  maxOutputTokens: 1000,
  timeoutMs: 30_000,
  documentationVerified: true,
  apiKey: "sk-test-key-value",
  transport: transportReturning({})
};

test("live execution is blocked until the transport is attested against provider documentation", async () => {
  const adapter = new OpenAiResponsesAdapter({ ...baseOptions, documentationVerified: false });
  await assert.rejects(adapter.invoke(request), (error: Error & { code?: string }) => {
    assert.equal(error.code, "OML_PROVIDER_LIVE_EXECUTION_BLOCKED");
    return true;
  });
});

test("live execution is refused when no credential is supplied", async () => {
  const { apiKey: _omitted, ...withoutKey } = baseOptions;
  const adapter = new OpenAiResponsesAdapter(withoutKey);
  await assert.rejects(adapter.invoke(request), (error: Error & { code?: string }) => {
    assert.equal(error.code, "OML_PROVIDER_CREDENTIAL_MISSING");
    return true;
  });
});

test("dry run records every field the research policy requires", async () => {
  const adapter = new OpenAiResponsesAdapter(baseOptions);
  const { response } = await adapter.invoke(request);
  const [record] = adapter.records;

  assert.equal(adapter.records.length, 1);
  assert.equal(record?.model_identifier, "gpt-5.6-luna");
  assert.equal(record?.provider_request_id, "req_1");
  assert.equal(record?.service_tier, "standard");
  assert.equal(record?.pricing_snapshot_id, "openai-2026-08-02");
  assert.equal(record?.retries, 0);
  assert.equal(record?.long_context_applied, false);
  assert.match(record?.prompt_sha256 ?? "", /^[0-9a-f]{64}$/);
  assert.ok(typeof record?.requested_at === "string");

  // 1000 uncached input at $0.2/M plus 500 output at $1.2/M.
  const expected = (1000 * 0.2 + 500 * 1.2) / 1_000_000;
  assert.ok(Math.abs((record?.token_cost_usd ?? 0) - expected) < 1e-12);
  assert.equal(response.billing.records[0]?.source, "reconstructed");
});

test("cost is never reported as exact provider billing", async () => {
  const adapter = new OpenAiResponsesAdapter(baseOptions);
  const { response } = await adapter.invoke(request);
  assert.notEqual(response.billing.accuracy, "exact_provider_reported");
  assert.equal(response.billing.accuracy, "reconstructed");
});

test("unreported cache writes downgrade accuracy to estimated and record the limitation", async () => {
  const adapter = new OpenAiResponsesAdapter({
    ...baseOptions,
    transport: transportReturning({ cache_write_reported: false })
  });
  const { response } = await adapter.invoke(request);
  assert.equal(response.billing.accuracy, "estimated");
  assert.ok(response.billing.omitted_charge_categories.includes("cache_write_tokens_not_reported_by_provider_response"));
});

test("long-context tier applies above the documented threshold", () => {
  const under = computeTokenCost(
    { input_tokens: LONG_CONTEXT_THRESHOLD_TOKENS, cached_input_tokens: 0, cache_write_tokens: 0, output_tokens: 0 },
    pricing,
    "gpt-5.6-luna",
    { cacheWriteReported: true }
  );
  const over = computeTokenCost(
    { input_tokens: LONG_CONTEXT_THRESHOLD_TOKENS + 1, cached_input_tokens: 0, cache_write_tokens: 0, output_tokens: 0 },
    pricing,
    "gpt-5.6-luna",
    { cacheWriteReported: true }
  );
  assert.equal(under.long_context_applied, false);
  assert.equal(over.long_context_applied, true);
  assert.ok(over.token_cost_usd > under.token_cost_usd);
});

test("cached input is billed at the cached rate and not double counted", () => {
  const cost = computeTokenCost(
    { input_tokens: 1000, cached_input_tokens: 800, cache_write_tokens: 0, output_tokens: 0 },
    pricing,
    "gpt-5.6-luna",
    { cacheWriteReported: true }
  );
  const expected = (200 * 0.2 + 800 * 0.02) / 1_000_000;
  assert.ok(Math.abs(cost.token_cost_usd - expected) < 1e-12);
});

test("tool calls are charged from the committed tool charge table", async () => {
  const adapter = new OpenAiResponsesAdapter({
    ...baseOptions,
    transport: transportReturning({ tool_calls: [{ name: "web_search_all_models", count: 3 }] })
  });
  await adapter.invoke(request);
  assert.ok(Math.abs((adapter.records[0]?.tool_cost_usd ?? 0) - 0.03) < 1e-12);
});

test("the request cap fails closed before a request is sent", async () => {
  let calls = 0;
  const adapter = new OpenAiResponsesAdapter({
    ...baseOptions,
    budget: { max_requests: 1, max_total_usd: 1, max_request_usd: 0.5 },
    transport: async (...args) => {
      calls += 1;
      return transportReturning({})(...args);
    }
  });
  await adapter.invoke(request);
  await assert.rejects(adapter.invoke(request), (error: Error & { code?: string }) => {
    assert.equal(error.code, "OML_BUDGET_EXCEEDED");
    return true;
  });
  assert.equal(calls, 1, "no request may be sent once the cap is reached");
});

test("the dollar cap fails closed on the pre-flight estimate", async () => {
  let calls = 0;
  const adapter = new OpenAiResponsesAdapter({
    ...baseOptions,
    budget: { max_requests: 10, max_total_usd: 1e-9, max_request_usd: 1e-9 },
    transport: async (...args) => {
      calls += 1;
      return transportReturning({})(...args);
    }
  });
  await assert.rejects(adapter.invoke(request), (error: Error & { code?: string }) => {
    assert.equal(error.code, "OML_BUDGET_EXCEEDED");
    return true;
  });
  assert.equal(calls, 0, "the cap must be enforced before the provider is contacted");
});

test("retries are bounded and recorded", async () => {
  let attempts = 0;
  const adapter = new OpenAiResponsesAdapter({
    ...baseOptions,
    maxRetries: 2,
    transport: async (...args) => {
      attempts += 1;
      if (attempts <= 2) throw new Error("transient");
      return transportReturning({})(...args);
    }
  });
  await adapter.invoke(request);
  assert.equal(attempts, 3);
  assert.equal(adapter.records[0]?.retries, 2);
});

test("a failing transport surfaces a deterministic code and consumes no budget", async () => {
  const adapter = new OpenAiResponsesAdapter({
    ...baseOptions,
    transport: async () => {
      throw new Error("boom");
    }
  });
  await assert.rejects(adapter.invoke(request), (error: Error & { code?: string }) => {
    assert.equal(error.code, "OML_ADAPTER_FAILED");
    return true;
  });
  assert.equal(adapter.budgetState.spent_usd, 0);
});

test("credentials never reach an error message", async () => {
  const adapter = new OpenAiResponsesAdapter({
    ...baseOptions,
    transport: async () => {
      throw new Error("upstream rejected key sk-test-key-value");
    }
  });
  await assert.rejects(adapter.invoke(request), (error: Error) => {
    assert.ok(!error.message.includes("sk-test-key-value"));
    assert.ok(!JSON.stringify(error).includes("sk-test-key-value"));
    return true;
  });
  assert.equal(redactSecrets("token sk-abcdefgh12345", undefined), "token [redacted]");
});

test("a malformed provider payload is an error, not a silent empty edit", () => {
  assert.deepEqual(parseProposedFiles(JSON.stringify({ files: [] })), []);
  assert.throws(() => parseProposedFiles("not json"), (error: Error & { code?: string }) => {
    assert.equal(error.code, "OML_PROVIDER_RESPONSE_INVALID");
    return true;
  });
  assert.throws(() => parseProposedFiles(JSON.stringify({ nope: 1 })), (error: Error & { code?: string }) => {
    assert.equal(error.code, "OML_PROVIDER_RESPONSE_INVALID");
    return true;
  });
});

test("budget guard rejects incoherent limits", () => {
  assert.throws(() => new BudgetGuard({ max_requests: 0, max_total_usd: 1, max_request_usd: 1 }));
  assert.throws(() => new BudgetGuard({ max_requests: 1, max_total_usd: 1, max_request_usd: 2 }));
});

test("the pre-flight estimate is pessimistic relative to a cache-assisted call", () => {
  const estimate = estimateRequestCost(1000, 1000, pricing, "gpt-5.6-luna");
  const actual = computeTokenCost(
    { input_tokens: 1000, cached_input_tokens: 1000, cache_write_tokens: 0, output_tokens: 100 },
    pricing,
    "gpt-5.6-luna",
    { cacheWriteReported: true }
  ).token_cost_usd;
  assert.ok(estimate > actual);
  assert.ok(estimateTokens("abcdef") >= 2);
});
