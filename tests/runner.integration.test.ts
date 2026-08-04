import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import test from "node:test";
import { assertReceiptHasNoHiddenArtifacts, runEvaluation } from "../src/runner.js";
import { interventionContentHash } from "../src/interventions.js";
import { OmlError } from "../src/errors.js";
import { createHash } from "node:crypto";
import type { InterventionPacket, InterventionReview, TaskFixture } from "../src/types.js";

test("runner executes the deterministic smoke fixture end to end", async () => {
  const runsRoot = await mkdtemp(join(tmpdir(), "oml-runner-"));
  const result = await runEvaluation({
    fixturePath: resolve("fixtures/smoke/task.json"),
    runsRoot
  });
  assert.equal(result.receipt.run_status, "completed");
  assert.equal(result.receipt.configured_verifier.status, "passed");
  assert.equal(result.receipt.claim_evaluation.status, "not_evaluated");
  assert.equal(result.receipt.terminal_evidence_status, "not_evaluated");
  assert.deepEqual(result.receipt.intervention, {
    treatment_id: "native", design: null, packet_file_sha256: null,
    packet_content_sha256: null, review_file_sha256: null
  });
  assert.equal(result.receipt.adapter_status.status, "passed");
  assert.match(result.receipt.task_fixture_sha256, /^[a-f0-9]{64}$/);
  assert.equal(result.receipt.model_snapshot, "test-double/not-a-model@fixture-1");
  assert.equal(result.receipt.cost_accuracy, "not_applicable");
  assert.equal(result.receipt.model, "test-double/not-a-model");
  assert.equal(result.receipt.cost_usd, 0);
  assert.equal(result.receipt.error_codes.length, 0);
  assert.deepEqual(result.receipt.evaluator_boundary, {
    classification: "interface_blind_host_confidentiality_not_enforced",
    detached_workspace: true,
    filtered_environment: true,
    treatment_metadata_declared: false,
    canary_count: 0
  });
  const receiptOnDisk = JSON.parse(await readFile(result.receiptPath, "utf8")) as { run_id: string };
  assert.equal(receiptOnDisk.run_id, result.receipt.run_id);
});

test("runner separates a completed run from a failed configured verifier", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "oml-failed-run-"));
  const originalPath = resolve("fixtures/smoke/task.json");
  const fixture = JSON.parse(await readFile(originalPath, "utf8")) as {
    repository: { path: string };
    adapter: { command: string[] };
    verifier: { command: string[] };
  };
  fixture.repository.path = resolve("fixtures/smoke/repository");
  fixture.adapter.command = ["node", resolve("fixtures/smoke/deterministic-adapter.mjs")];
  fixture.verifier.command = ["node", "-e", "process.exit(9)"];
  const fixturePath = join(temporary, "failed-task.json");
  await writeFile(fixturePath, JSON.stringify(fixture), "utf8");
  const result = await runEvaluation({ fixturePath, runsRoot: join(temporary, "runs") });
  assert.equal(result.receipt.run_status, "completed");
  assert.equal(result.receipt.configured_verifier.status, "failed");
  assert.deepEqual(result.receipt.error_codes, ["OML_VERIFIER_FAILED"]);
  assert.equal(result.receipt.configured_verifier.exit_code, 9);
  assert.equal(result.receipt.claim_evaluation.status, "not_evaluated");
  assert.equal(result.receipt.terminal_evidence_status, "not_evaluated");
});

test("runner records a selected oracle treatment without exposing the packet path", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "oml-oracle-run-"));
  const fixture = JSON.parse(await readFile(resolve("fixtures/smoke/task.json"), "utf8")) as TaskFixture;
  fixture.repository.path = resolve("fixtures/smoke/repository");
  fixture.adapter.command = ["node", resolve("fixtures/smoke/deterministic-adapter.mjs")];
  fixture.verifier.command = ["node", resolve("fixtures/method/blind-verifier.mjs"), "{workspace}"];
  const fixturePath = join(temporary, "task.json");
  await writeFile(fixturePath, JSON.stringify(fixture), "utf8");
  const packetPath = join(temporary, "oracle.json");
  const reviewPath = join(temporary, "review.json");
  const packet: InterventionPacket = {
    schema_version: "0.2",
    task_id: "harness-smoke-not-a-model-eval",
    task_base_commit: "fixture-2026-08-01",
    intervention_level: "L1_context",
    design: "cumulative",
    payload: { context: { regions: [{ path: "input.txt", start_line: 1, end_line: 1 }] } },
    source: { kind: "synthetic_mechanics_only", evidence_refs: ["fixture:input"], fixed_commit_accessible_to_agent: false, facts_visible_from_base: true },
    information_boundary: {
      allowed_categories: ["context"], forbidden_categories: ["patch_text"], contains_diagnosis: false,
      contains_plan: false, contains_code_location: true, contains_exact_identifier: false, contains_patch_text: false
    },
    review_record_sha256: "0".repeat(64),
    provenance: { created_at: "2026-08-02T00:00:00-04:00", rubric_version: "oracle-boundary/1.0.0", revision: 1, content_sha256: "0".repeat(64) }
  };
  packet.provenance.content_sha256 = interventionContentHash(packet);
  const review: InterventionReview = {
    schema_version: "0.1", task_id: packet.task_id, intervention_level: packet.intervention_level,
    packet_content_sha256: packet.provenance.content_sha256, author_id: "author",
    reviews: [{ reviewer_id: "reviewer", decision: "approve", leak_classification: "clean", assigned_level: "L1_context", reviewed_at: "2026-08-02T00:01:00-04:00" }],
    disagreement: null,
    revision_history: [{ revision: 1, content_sha256: packet.provenance.content_sha256, changed_at: "2026-08-02T00:00:00-04:00" }],
    final_status: "approved", finalized_at: "2026-08-02T00:02:00-04:00", review_policy_version: "intervention-review/1.0.0"
  };
  const reviewBytes = Buffer.from(JSON.stringify(review));
  await writeFile(reviewPath, reviewBytes);
  packet.review_record_sha256 = createHash("sha256").update(reviewBytes).digest("hex");
  await writeFile(packetPath, JSON.stringify(packet), "utf8");
  const result = await runEvaluation({
    fixturePath,
    runsRoot: join(temporary, "runs"),
    treatmentId: "L1_context",
    interventionPath: packetPath,
    interventionReviewPath: reviewPath,
    interventionDesign: "cumulative"
  });
  assert.equal(result.receipt.intervention.treatment_id, "L1_context");
  assert.match(result.receipt.intervention.packet_file_sha256 ?? "", /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(result.receipt).includes(packetPath), false);
  const rawTrace = result.receipt.artifacts.find((artifact) => artifact.kind === "adapter.raw_trace");
  assert.ok(rawTrace);
  const adapterView = JSON.parse(await readFile(join(result.runRoot, "artifacts", rawTrace.relative_path), "utf8")) as {
    request_keys: string[]; assistance_keys: string[];
  };
  assert.equal(adapterView.request_keys.includes("treatment_id"), false);
  assert.deepEqual(adapterView.assistance_keys, ["payload", "schema_version"]);
  assert.equal(result.receipt.configured_verifier.status, "passed");
});

test("runner rejects missing/unexpected oracle inputs and stale fixture identity", async () => {
  const runsRoot = await mkdtemp(join(tmpdir(), "oml-runner-boundaries-"));
  await assert.rejects(
    runEvaluation({ fixturePath: resolve("fixtures/smoke/task.json"), runsRoot, treatmentId: "L1_context" }),
    matches("OML_INTERVENTION_REQUIRED")
  );
  await assert.rejects(
    runEvaluation({
      fixturePath: resolve("fixtures/smoke/task.json"), runsRoot, treatmentId: "native",
      interventionPath: resolve("fixtures/smoke/task.json"), interventionReviewPath: resolve("fixtures/smoke/task.json")
    }),
    matches("OML_INTERVENTION_UNEXPECTED")
  );
  await assert.rejects(
    runEvaluation({ fixturePath: resolve("fixtures/smoke/task.json"), runsRoot, expectedTaskFixtureSha256: "0".repeat(64) }),
    matches("OML_EXPERIMENT_FREEZE_MISMATCH")
  );
  await assert.rejects(
    runEvaluation({ fixturePath: resolve("fixtures/smoke/task.json"), runsRoot, expectedRepositoryCommit: "stale" }),
    matches("OML_STALE_TASK_COMMIT")
  );
});

function matches(code: OmlError["code"]) {
  return (error: unknown) => error instanceof OmlError && error.code === code;
}

test("runner refuses a fixture that asks copy isolation to run sandbox-required work", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "oml-sandbox-refusal-"));
  const fixture = JSON.parse(await readFile(resolve("fixtures/smoke/task.json"), "utf8")) as {
    requires_security_sandbox: boolean;
  };
  fixture.requires_security_sandbox = true;
  const fixturePath = join(temporary, "sandbox-task.json");
  await writeFile(fixturePath, JSON.stringify(fixture), "utf8");
  await assert.rejects(runEvaluation({ fixturePath, runsRoot: join(temporary, "runs") }), /security sandbox/);
});

test("runner records adapter failure and timeout with deterministic codes", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "oml-adapter-failures-"));
  const original = JSON.parse(await readFile(resolve("fixtures/smoke/task.json"), "utf8")) as TaskFixture;
  original.repository.path = resolve("fixtures/smoke/repository");
  original.adapter.command = ["node", "-e", "process.exit(7)"];
  const failedPath = join(temporary, "failed.json");
  await writeFile(failedPath, JSON.stringify(original), "utf8");
  const failed = await runEvaluation({ fixturePath: failedPath, runsRoot: join(temporary, "failed-runs") });
  assert.equal(failed.receipt.run_status, "error");
  assert.deepEqual(failed.receipt.error_codes, ["OML_ADAPTER_FAILED"]);
  assert.deepEqual(failed.receipt.adapter_status, { status: "failed", exit_code: 7 });

  original.adapter.command = ["node", "-e", "setTimeout(() => {}, 1000)"];
  original.limits.adapter_timeout_ms = 10;
  const timeoutPath = join(temporary, "timeout.json");
  await writeFile(timeoutPath, JSON.stringify(original), "utf8");
  const timedOut = await runEvaluation({ fixturePath: timeoutPath, runsRoot: join(temporary, "timeout-runs") });
  assert.equal(timedOut.receipt.run_status, "error");
  assert.deepEqual(timedOut.receipt.error_codes, ["OML_PROCESS_TIMEOUT"]);
});

test("runner rejects internally inconsistent provider billing", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "oml-billing-invalid-"));
  const fixture = JSON.parse(await readFile(resolve("fixtures/smoke/task.json"), "utf8")) as TaskFixture;
  fixture.repository.path = resolve("fixtures/smoke/repository");
  const response = {
    schema_version: "0.1", files: [], claims: [],
    usage: { input_tokens: 10, cached_input_tokens: 0, output_tokens: 1 },
    billing: { accuracy: "exact_provider_reported", records: [], omitted_charge_categories: [] }
  };
  const encoded = Buffer.from(JSON.stringify(response)).toString("base64");
  fixture.adapter.command = ["node", "-e", "process.stdout.write(Buffer.from(process.argv[1], 'base64'))", encoded];
  const fixturePath = join(temporary, "billing.json");
  await writeFile(fixturePath, JSON.stringify(fixture), "utf8");
  const result = await runEvaluation({ fixturePath, runsRoot: join(temporary, "runs") });
  assert.equal(result.receipt.run_status, "error");
  assert.deepEqual(result.receipt.error_codes, ["OML_RECEIPT_INCONSISTENT"]);
});

test("runner records evaluator timeout separately from adapter timeout", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "oml-scorer-timeout-"));
  const fixture = JSON.parse(await readFile(resolve("fixtures/smoke/task.json"), "utf8")) as TaskFixture;
  fixture.repository.path = resolve("fixtures/smoke/repository");
  fixture.adapter.command = ["node", resolve("fixtures/smoke/deterministic-adapter.mjs")];
  fixture.verifier.command = ["node", "-e", "setTimeout(() => {}, 1000)"];
  fixture.limits.verifier_timeout_ms = 10;
  const fixturePath = join(temporary, "task.json");
  await writeFile(fixturePath, JSON.stringify(fixture), "utf8");
  const result = await runEvaluation({ fixturePath, runsRoot: join(temporary, "runs") });
  assert.equal(result.receipt.run_status, "error");
  assert.deepEqual(result.receipt.error_codes, ["OML_SCORER_TIMEOUT"]);
});

test("user-visible receipt metadata rejects control-only artifact paths", () => {
  const receipt = {
    artifacts: [{ kind: "hidden-verifier", relative_path: ".oml-hidden/evidence.json" }]
  } as unknown as Parameters<typeof assertReceiptHasNoHiddenArtifacts>[0];
  assert.throws(() => assertReceiptHasNoHiddenArtifacts(receipt, [".oml-hidden"]), matches("OML_HIDDEN_ARTIFACT_EXPOSED"));
});
