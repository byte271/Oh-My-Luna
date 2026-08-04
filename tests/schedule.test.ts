import assert from "node:assert/strict";
import test from "node:test";
import { buildRandomizedSchedule } from "../src/schedule.js";
import { validateExperimentPlan } from "../src/schema.js";
import type { ExperimentPlan } from "../src/types.js";

const SHA = "b".repeat(64);

function plan(): ExperimentPlan {
  return {
    schema_version: "0.2",
    id: "method-validation",
    gate: "M_method_validation",
    task_selection_freeze_sha256: SHA,
    task_ids: ["task-a", "task-b"],
    primary_design: "mechanics_only",
    treatments: ["native", "L1_context", "L3_observation"],
    controls: {
      model_snapshot: "test-double/not-a-model@fixture-1",
      reasoning_effort: "not_applicable",
      max_attempts: 1,
      token_budget: 100,
      cost_budget_usd: 0,
      timeout_ms: 1000,
      cache_mode: "disabled",
      service_tier: "not_applicable",
      tool_permissions: [],
      randomization_seed: 271,
      repetitions: 2,
      retain_all_attempts: true
    },
    scoring: { hidden: true, treatment_blind: true, fixed_patch_inaccessible: true, other_arm_traces_inaccessible: true },
    analysis: {
      primary_generalization_unit: "task",
      minimum_meaningful_effect: 0.1,
      representative_and_high_gap_reported_separately: true,
      repeats_not_counted_as_independent_tasks: true,
      minimum_sufficient_rule: "First level over the frozen effect threshold without leakage."
    }
  };
}

test("builds a deterministic randomized full task-treatment-repetition schedule", async () => {
  const validated = await validateExperimentPlan(plan());
  const first = buildRandomizedSchedule(validated);
  const second = buildRandomizedSchedule(validated);
  assert.deepEqual(first, second);
  assert.equal(first.length, 12);
  assert.equal(new Set(first.map((entry) => entry.assignment_id)).size, first.length);
  for (const taskId of validated.task_ids) {
    for (const treatment of validated.treatments) {
      assert.equal(first.filter((entry) => entry.task_id === taskId && entry.treatment_id === treatment).length, 2);
    }
  }
});

test("Gate H schema rejects practical approximation arms", async () => {
  const value = plan();
  value.gate = "H_causal_headroom";
  value.primary_design = "cumulative_ladder";
  value.treatments = ["native", "deterministic_baseline"];
  await assert.rejects(validateExperimentPlan(value));
});

test("Gate A schema requires at least one practical approximation arm", async () => {
  const value = plan();
  value.gate = "A_approximation_feasibility";
  value.primary_design = "approximation_comparison";
  value.treatments = ["native", "oracle_upper_bound"];
  await assert.rejects(validateExperimentPlan(value));
});
