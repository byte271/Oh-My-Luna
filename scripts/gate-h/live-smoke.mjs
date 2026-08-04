// Smallest possible paid validation: ONE task, ONE T0 attempt, 0 tools, 0 retries.
//
// This validates the TRANSPORT, not the model. Two outcomes are reported
// separately and must never be conflated:
//
//   transport_valid  the provider accepted the request and the receipt captured
//                    real identity, usage and cost
//   task_success     the repository task actually passed
//
// A failed task with a valid receipt still validates the transport. Nothing
// here supports any conclusion about model quality.
//
// Runs only when all three authorization signals are present in the
// environment. This script never reads a credential from source and never
// writes one to disk.
//
// Usage: node scripts/gate-h/live-smoke.mjs [--task <id>]

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { checkLiveAuthorization, formatPreflight } from "../../dist/src/providers/live-gate.js";
import { BudgetGuard } from "../../dist/src/providers/budget.js";
import { computeTokenCost, estimateRequestCost } from "../../dist/src/providers/openai-cost.js";
import {
  SDK_VERSION,
  callResponses,
  createClient,
  newClientRequestId,
  LiveTransportError
} from "../../dist/src/providers/openai-transport.js";
import { validateProviderOutput } from "../../dist/src/providers/output-validation.js";

const root = resolve(new URL("../..", import.meta.url).pathname);

const MODEL = "gpt-5.6-luna";
// Frozen before the call and recorded. Do not change after seeing a result.
const REASONING_EFFORT = "low";
const MAX_OUTPUT_TOKENS = 4096;
const TIMEOUT_MS = 120_000;
const EVIDENCE_ID = "provider-contract-2026-08-02";

const taskArgIndex = process.argv.indexOf("--task");
const TASK_ID = taskArgIndex > -1 ? process.argv[taskArgIndex + 1] : "date-fns-zh-month";

const auth = checkLiveAuthorization();
if (!auth.authorized) {
  process.stderr.write(
    `live smoke not run: ${auth.detail}\n` +
      `reason: ${auth.reason}\n\n` +
      "All three are required and none may be committed:\n" +
      "  OPENAI_API_KEY=<key>\n  OML_LIVE_APPROVED=1\n  OML_LIVE_BUDGET_USD=<positive limit>\n"
  );
  process.exit(20);
}

const pricing = JSON.parse(await readFile(resolve(root, "data/pricing/openai-2026-08-02.evidence.json"), "utf8"));
const issue = await readFile(resolve(root, `tasks/gate-m/${TASK_ID}/visible/issue.md`), "utf8");

// T0 is native: the issue only. No packet, no context, no assistance.
const input = [
  "You are fixing a defect in a TypeScript repository.",
  "",
  issue.trim(),
  "",
  "Reply with a single JSON object and nothing else:",
  '{"files":[{"path":"<repository-relative path>","contents":"<complete new file contents>"}]}'
].join("\n");

const guard = new BudgetGuard({
  max_requests: 1,
  max_total_usd: auth.authorization.budgetUsd,
  max_request_usd: auth.authorization.budgetUsd
});

const promptTokenEstimate = Math.ceil(input.length / 3);
const pessimistic = estimateRequestCost(promptTokenEstimate, MAX_OUTPUT_TOKENS, pricing, MODEL);

const preflight = {
  requested_model: MODEL,
  task_id: TASK_ID,
  treatment: "T0",
  max_output_tokens: MAX_OUTPUT_TOKENS,
  reasoning_effort: REASONING_EFFORT,
  pessimistic_max_cost_usd: pessimistic,
  remaining_budget_usd: auth.authorization.budgetUsd,
  documentation_evidence_id: EVIDENCE_ID,
  sdk_version: SDK_VERSION
};
process.stderr.write(`${formatPreflight(preflight)}\n\n`);

// The guard runs before the provider is contacted.
try {
  guard.reserve(pessimistic);
} catch (error) {
  process.stderr.write(`budget guard refused the request: ${error.message}\n`);
  process.exit(21);
}

const clientRequestId = newClientRequestId();
const client = createClient(auth.authorization.apiKey, TIMEOUT_MS);

let receipt;
try {
  const result = await callResponses(
    client,
    {
      model: MODEL,
      input,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      reasoningEffort: REASONING_EFFORT,
      timeoutMs: TIMEOUT_MS,
      clientRequestId
    },
    auth.authorization.apiKey
  );

  const cacheWriteReported = result.cache_write_tokens !== null;
  const cost = computeTokenCost(
    {
      input_tokens: result.input_tokens ?? 0,
      cached_input_tokens: result.cached_input_tokens ?? 0,
      cache_write_tokens: result.cache_write_tokens ?? 0,
      output_tokens: result.output_tokens ?? 0
    },
    pricing,
    MODEL,
    { cacheWriteReported }
  );
  guard.settle(pessimistic, cost.token_cost_usd);

  const verdict = validateProviderOutput(result.output_text, {
    status: result.status,
    incompleteReason: result.incomplete_reason,
    maxBytes: 1_000_000,
    permittedPaths: []
  });

  receipt = {
    schema_version: "1.0",
    purpose: "gate_h_transport_validation_only",
    capability_claim_permitted: false,
    provider_outcome: "completed",
    billing_status: "incurred",
    preflight,
    provider_response_id: result.provider_response_id,
    server_request_id: result.server_request_id,
    client_request_id: result.client_request_id,
    requested_model: result.requested_model,
    returned_model: result.returned_model,
    created_at: result.created_at,
    status: result.status,
    incomplete_reason: result.incomplete_reason,
    output_item_types: result.output_item_types,
    usage: {
      input_tokens: result.input_tokens,
      cached_input_tokens: result.cached_input_tokens,
      cache_write_tokens: result.cache_write_tokens,
      output_tokens: result.output_tokens,
      reasoning_tokens: result.reasoning_tokens,
      total_tokens: result.total_tokens
    },
    raw_usage: result.raw_usage,
    service_tier: result.service_tier,
    duration_ms: result.duration_ms,
    retries: 0,
    cost: {
      token_cost_usd: cost.token_cost_usd,
      accuracy: cost.accuracy,
      long_context_applied: cost.long_context_applied,
      pricing_snapshot_id: pricing.evidence_id,
      limitations: cost.omitted_charge_categories
    },
    // The two claims, kept apart on purpose.
    transport_valid:
      result.provider_response_id !== null && result.input_tokens !== null && result.output_tokens !== null,
    task_success: verdict.ok,
    task_failure_reason: verdict.ok ? null : verdict.reason,
    snapshot_limitation:
      "gpt-5.6-luna is a mutable alias; no immutable snapshot identifier exists, so exact model-weight reproducibility is not guaranteed.",
    sdk_version: SDK_VERSION,
    documentation_evidence_id: EVIDENCE_ID
  };
} catch (error) {
  if (!(error instanceof LiveTransportError)) throw error;
  receipt = {
    schema_version: "1.0",
    purpose: "gate_h_transport_validation_only",
    capability_claim_permitted: false,
    provider_outcome: error.failure.outcome,
    billing_status: error.failure.billing_status,
    preflight,
    client_request_id: error.failure.client_request_id,
    server_request_id: error.failure.server_request_id,
    error_class: error.failure.error_class,
    status_code: error.failure.status_code,
    retryable: error.failure.retryable,
    retries: 0,
    message: error.failure.message,
    duration_ms: error.failure.duration_ms,
    transport_valid: false,
    task_success: false,
    // An uncertain call is never retried automatically; the client request id
    // is what makes provider-side investigation possible.
    investigation_hint:
      error.failure.outcome === "unknown"
        ? "Provider execution and billing are uncertain. Investigate using the client request id before any further call."
        : null,
    sdk_version: SDK_VERSION,
    documentation_evidence_id: EVIDENCE_ID
  };
}

await mkdir(resolve(root, ".oml-runs/live-smoke"), { recursive: true });
const path = resolve(root, ".oml-runs/live-smoke", `${clientRequestId}.json`);
await writeFile(path, `${JSON.stringify(receipt, null, 2)}\n`);

process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
process.stderr.write(
  `\nreceipt: ${path}\n` +
    `transport_valid=${receipt.transport_valid} task_success=${receipt.task_success}\n` +
    "Live execution stops here. No model-quality conclusion may be drawn from one call.\n"
);
process.exit(receipt.transport_valid ? 0 : 22);
