import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { OmlError } from "../src/errors.js";
import { gateMFreezeAggregateHash, verifyGateMStudyFreeze } from "../src/gate-m-freeze.js";
import type { GateMStudyFreeze } from "../src/types.js";

test("Gate M aggregate detects scorer, environment, and general mutations with distinct codes", async () => {
  await mkdir(resolve(".test-temp"), { recursive: true });
  for (const [role, expected] of [["scorer", "OML_SCORER_IDENTITY_MISMATCH"], ["environment", "OML_ENVIRONMENT_IDENTITY_MISMATCH"], ["review", "OML_EXPERIMENT_FREEZE_MISMATCH"]] as const) {
    const root = await mkdtemp(resolve(".test-temp/freeze-"));
    const artifactPath = `${role}.txt`;
    for (const name of ["scorer.txt", "environment.txt", "review.txt"]) await writeFile(resolve(root, name), "frozen", "utf8");
    const freeze = syntheticFreeze(sha256(Buffer.from("frozen")));
    freeze.aggregate_sha256 = gateMFreezeAggregateHash(freeze);
    const freezePath = resolve(root, "identity.json");
    await writeFile(freezePath, JSON.stringify(freeze), "utf8");
    await verifyGateMStudyFreeze(freezePath, root);
    await writeFile(resolve(root, artifactPath), "mutated", "utf8");
    await assert.rejects(verifyGateMStudyFreeze(freezePath, root), matches(expected));
  }
});

test("pre-review freeze cannot masquerade as executable", async () => {
  await mkdir(resolve(".test-temp"), { recursive: true });
  const root = await mkdtemp(resolve(".test-temp/freeze-executable-"));
  for (const name of ["scorer.txt", "environment.txt", "review.txt"]) await writeFile(resolve(root, name), "x", "utf8");
  const freeze = syntheticFreeze(sha256(Buffer.from("x")));
  freeze.status = "executable";
  freeze.treatment_execution.executable = true;
  freeze.treatment_execution.schedule_sha256 = "a".repeat(64);
  freeze.aggregate_sha256 = gateMFreezeAggregateHash(freeze);
  const path = resolve(root, "identity.json");
  await writeFile(path, JSON.stringify(freeze), "utf8");
  await assert.rejects(verifyGateMStudyFreeze(path, root), matches("OML_REVIEW_POLICY_UNSATISFIED"));
});

function syntheticFreeze(hash: string): GateMStudyFreeze {
  const artifacts: GateMStudyFreeze["artifacts"] = [
    { role: "scorer", path: "scorer.txt", sha256: hash },
    { role: "environment", path: "environment.txt", sha256: hash },
    { role: "review", path: "review.txt", sha256: hash }
  ];
  return {
    schema_version: "0.1", freeze_id: "synthetic-freeze", created_at: "2026-08-02T07:00:00Z", phase: "gate_m_method_validation", status: "pre_review", capability_claim_permitted: false,
    code_identity: { commit: "1234567", tree: "7654321" },
    model_execution: { live_model_calls: false, adapter_id: "deterministic-test-double", adapter_sha256: "a".repeat(64), model_snapshot: "test-double/not-a-model@fixture-1", reasoning_effort: "none", prompt_sha256: null, skill_sha256: null },
    review: { policy_sha256: "a".repeat(64), blinded_schedule_sha256: "b".repeat(64), required_distinct_reviewers: 2, completed_distinct_reviewers: 0, agreement_status: "pending" },
    treatment_execution: { executable: false, schedule_sha256: null, blocked_by: ["review pending"] },
    scorer: { source_path: "scorer.txt", source_sha256: hash, classification: "interface_blind_host_confidentiality_not_enforced" },
    pricing: { path: "review.txt", sha256: hash, snapshot_id: "synthetic" },
    tasks: Array.from({ length: 4 }, (_, index) => ({ task_id: `task-${index}`, manifest_sha256: "a".repeat(64), base_commit: "1234567", corrected_commit: "7654321", evaluator_sha256: "b".repeat(64), environment_definition_sha256: hash })),
    artifacts,
    aggregate_sha256: "0".repeat(64)
  };
}

function sha256(value: Buffer): string { return createHash("sha256").update(value).digest("hex"); }
function matches(code: OmlError["code"]) { return (error: unknown) => error instanceof OmlError && error.code === code; }
