import assert from "node:assert/strict";
import test from "node:test";
import { findDatasetLeakage } from "../src/leakage.js";
import type { TaskManifestRecord } from "../src/types.js";

function record(id: string, split: TaskManifestRecord["split"], organization = "acme", name = "widget"): TaskManifestRecord {
  return {
    schema_version: "0.1",
    id,
    repository: { organization, name, base_commit: "1111111", fixed_commit: "2222222" },
    split,
    task_statement: "Repair the reported behavior.",
    task_family: "bug_fix",
    provenance: { source_url: "https://example.invalid", license_spdx: "MIT", derived_at: "2026-08-01T00:00:00Z" },
    hashes: { base_archive_sha256: "a".repeat(64), hidden_verifier_sha256: "b".repeat(64) },
    boundaries: { agent_visible_paths: ["src"], hidden_paths: [".oml-hidden/verifier"] }
  };
}

test("detects repository-disjoint split leakage", () => {
  const findings = findDatasetLeakage([record("one", "development"), record("two", "held_out")], {
    repository_disjoint: true,
    organization_disjoint: false
  });
  assert.ok(findings.some((finding) => finding.code === "OML_LEAK_REPOSITORY_CROSS_SPLIT"));
});

test("accepts repository-disjoint records", () => {
  const findings = findDatasetLeakage([
    record("one", "development", "acme", "widget"),
    record("two", "held_out", "other", "gadget")
  ], { repository_disjoint: true, organization_disjoint: true });
  assert.deepEqual(findings, []);
});

test("detects hidden path overlap and fixed-commit disclosure", () => {
  const leaky = record("one", "development");
  leaky.task_statement = "Apply the behavior from commit 2222222.";
  leaky.boundaries.agent_visible_paths.push(".oml-hidden\\verifier");
  const codes = findDatasetLeakage([leaky], { repository_disjoint: true, organization_disjoint: false }).map((item) => item.code);
  assert.ok(codes.includes("OML_LEAK_FIX_COMMIT_IN_TASK"));
  assert.ok(codes.includes("OML_LEAK_HIDDEN_PATH_VISIBLE"));
});
