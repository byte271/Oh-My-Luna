import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { OmlError } from "../src/errors.js";
import { loadFixture } from "../src/fixture.js";
import { assertRunMatchesExperimentFreeze, loadExperimentFreeze, loadTaskSelection } from "../src/freezes.js";
import type { ExperimentFreeze, TaskPoolCandidate, TaskPoolManifest, TaskSelectionFreeze } from "../src/types.js";

const SHA = "a".repeat(64);

function candidate(id: string, organization: string): TaskPoolCandidate {
  return {
    id,
    repository: { organization, name: `${id}-repo`, base_commit: "1111111", fixed_commit: "2222222" },
    task_source: { kind: "curated", url: `https://example.invalid/${id}` },
    task_statement: "Mechanical method-validation task.",
    task_family: "bug_fix",
    language: "typescript",
    estimated_human_difficulty: "small",
    visible_tests: ["npm test"],
    hidden_verifier: { available: true, sha256: SHA },
    environment: { reproducible: true, definition_sha256: SHA },
    licensing: { spdx: "MIT", redistribution_permitted: true },
    contamination: { risk: "low", notes: "Mechanical method fixture only." },
    mechanics: {
      base_fails_hidden_verifier: true, fixed_passes_hidden_verifier: true, infrastructure_valid: true,
      original_failure_evidence_ref: "artifact:base-failure", fixed_success_evidence_ref: "artifact:fixed-success"
    },
    selection: { status: "included", exclusion_reason: null, selected_at: "2026-08-02T01:00:00-04:00" }
  };
}

async function writeSelection(
  mutatePool?: (pool: TaskPoolManifest) => void,
  mutateFreeze?: (freeze: TaskSelectionFreeze) => void
): Promise<{ poolPath: string; freezePath: string }> {
  const directory = await mkdtemp(join(tmpdir(), "oml-freeze-"));
  const poolPath = join(directory, "pool.json");
  const freezePath = join(directory, "freeze.json");
  const pool: TaskPoolManifest = {
    schema_version: "0.1",
    pool_id: "method-pool",
    constructed_at: "2026-08-02T01:00:00-04:00",
    selection_rule_version: "selection/1.0.0",
    candidates: [candidate("representative-one", "org-a"), candidate("high-gap-one", "org-b")]
  };
  mutatePool?.(pool);
  await writeFile(poolPath, JSON.stringify(pool), "utf8");
  const task_pool_sha256 = createHash("sha256").update(await readFile(poolPath)).digest("hex");
  const freeze: TaskSelectionFreeze = {
    schema_version: "0.1",
    freeze_id: "method-freeze",
    created_at: "2026-08-02T01:01:00-04:00",
    selection_rule_version: "selection/1.0.0",
    task_pool_sha256,
    overlap_policy: "disallowed",
    representative_task_ids: ["representative-one"],
    high_gap_task_ids: ["high-gap-one"],
    representative_rule: { method: "seeded_random", randomization_seed: 271, stratification: ["language", "task_family"] },
    high_gap_rule: {
      native_model_snapshot: "gpt-5.6-luna-snapshot",
      native_runs_per_task: 2,
      failure_rate_threshold: 0.5,
      solvability_evidence: ["fixed_commit"],
      native_baseline_results_sha256: SHA
    }
  };
  mutateFreeze?.(freeze);
  await writeFile(freezePath, JSON.stringify(freeze), "utf8");
  return { poolPath, freezePath };
}

const matches = (code: string) => (error: unknown) => error instanceof OmlError && error.code === code;

test("loads a frozen, disjoint representative and high-gap selection", async () => {
  const paths = await writeSelection();
  const loaded = await loadTaskSelection(paths.poolPath, paths.freezePath);
  assert.deepEqual(loaded.freeze.representative_task_ids, ["representative-one"]);
  assert.deepEqual(loaded.freeze.high_gap_task_ids, ["high-gap-one"]);
});

test("rejects task-pool mutation after freeze", async () => {
  const paths = await writeSelection();
  const pool = JSON.parse(await readFile(paths.poolPath, "utf8")) as TaskPoolManifest;
  pool.candidates[0]!.estimated_human_difficulty = "medium";
  await writeFile(paths.poolPath, JSON.stringify(pool), "utf8");
  await assert.rejects(loadTaskSelection(paths.poolPath, paths.freezePath), matches("OML_TASK_POOL_FREEZE_MISMATCH"));
});

test("rejects representative/high-gap overlap", async () => {
  const paths = await writeSelection(undefined, (freeze) => freeze.high_gap_task_ids = ["representative-one"]);
  await assert.rejects(loadTaskSelection(paths.poolPath, paths.freezePath), matches("OML_TASK_SELECTION_INVALID"));
});

test("rejects a selected task without validated mechanics", async () => {
  const paths = await writeSelection((pool) => pool.candidates[0]!.mechanics.base_fails_hidden_verifier = false);
  await assert.rejects(loadTaskSelection(paths.poolPath, paths.freezePath), matches("OML_TASK_SELECTION_INVALID"));
});

test("loads an experiment freeze and binds a run to fixture/model/environment identity", async () => {
  const loadedFixture = await loadFixture("fixtures/smoke/task.json");
  const freeze: ExperimentFreeze = {
    schema_version: "0.1", freeze_id: "experiment-freeze", created_at: "2026-08-02T01:02:00-04:00",
    task_selection_freeze_sha256: SHA, experiment_plan_sha256: SHA,
    task_fixtures: [{ task_id: loadedFixture.fixture.id, fixture_sha256: loadedFixture.fixtureSha256, repository_commit: loadedFixture.fixture.repository.commit }],
    interventions: [{ task_id: loadedFixture.fixture.id, treatment_id: "L1_context", design: "cumulative", packet_file_sha256: SHA, review_file_sha256: SHA }],
    prompts: { native_sha256: loadedFixture.fixture.adapter.prompt_sha256, lean_skill_sha256: null },
    model_snapshot: loadedFixture.fixture.adapter.model_snapshot,
    reasoning_effort: loadedFixture.fixture.adapter.reasoning_effort,
    environment_definition_sha256: loadedFixture.fixture.environment.definition_sha256
  };
  const directory = await mkdtemp(join(tmpdir(), "oml-experiment-freeze-"));
  const path = join(directory, "freeze.json");
  await writeFile(path, JSON.stringify(freeze), "utf8");
  const loadedFreeze = await loadExperimentFreeze(path);
  assertRunMatchesExperimentFreeze(loadedFreeze.freeze, loadedFixture, "native");
  assertRunMatchesExperimentFreeze(loadedFreeze.freeze, loadedFixture, "L1_context", SHA, SHA);
  await assert.rejects(loadExperimentFreeze(path, "0".repeat(64)), matches("OML_EXPERIMENT_FREEZE_MISMATCH"));
  assert.throws(
    () => assertRunMatchesExperimentFreeze(loadedFreeze.freeze, loadedFixture, "L1_context", "0".repeat(64), SHA),
    matches("OML_EXPERIMENT_FREEZE_MISMATCH")
  );
});
