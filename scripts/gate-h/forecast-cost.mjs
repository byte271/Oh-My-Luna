// Cost forecast for the Gate H exploratory pilot.
//
// Uses the same committed pricing evidence and the same cost function as the
// live adapter, so the forecast and the eventual accounting cannot drift apart.
// Token counts are assumptions, clearly labelled as such; they are the only
// unverified input here.
//
// Usage: node scripts/gate-h/forecast-cost.mjs [--json]

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { computeTokenCost } from "../../dist/src/providers/openai-cost.js";

const root = resolve(new URL("../..", import.meta.url).pathname);

const DESIGN = {
  tasks: 4,
  repositories: 3,
  arms: ["T0", "T1", "T2", "T3"],
  repetitions: 3,
};

// Assumed per-request token usage. These are estimates, not measurements: no
// live call has been made. The prompt grows with the treatment because each arm
// carries more packet material.
const ASSUMED = {
  T0: { input: 18_000, output: 6_000 },
  T1: { input: 19_000, output: 6_000 },
  T2: { input: 19_500, output: 6_000 },
  T3: { input: 21_000, output: 6_000 },
};

// A pilot run may need more than one model turn per attempt (read, edit,
// re-check). Assumed, and deliberately not optimistic.
const TURNS_PER_ATTEMPT = 3;

const evidence = JSON.parse(await readFile(resolve(root, "data/pricing/openai-2026-08-02.evidence.json"), "utf8"));

const rows = [];
let total = 0;
for (const arm of DESIGN.arms) {
  const assumed = ASSUMED[arm];
  const perTurn = computeTokenCost(
    { input_tokens: assumed.input, cached_input_tokens: 0, cache_write_tokens: 0, output_tokens: assumed.output },
    evidence,
    "gpt-5.6-luna",
    { cacheWriteReported: false }
  ).token_cost_usd;
  const attempts = DESIGN.tasks * DESIGN.repetitions;
  const armCost = perTurn * TURNS_PER_ATTEMPT * attempts;
  total += armCost;
  rows.push({ arm, per_turn_usd: perTurn, turns_per_attempt: TURNS_PER_ATTEMPT, attempts, arm_total_usd: armCost });
}

// Cap with headroom for retries and underestimated prompts. The guard enforces
// this, so it must be comfortably above the forecast or the run aborts midway.
const recommendedCap = Math.ceil(total * 3 * 100) / 100;

// Scenario forecasts that matter now. The 48-attempt fixture is retained for
// history but is a contaminated pipeline fixture and disabled as capability
// evidence, so its total is reported as reference only.
const perTurn = (arm) => {
  const a = ASSUMED[arm];
  return computeTokenCost(
    { input_tokens: a.input, cached_input_tokens: 0, cache_write_tokens: 0, output_tokens: a.output },
    evidence,
    "gpt-5.6-luna",
    { cacheWriteReported: false }
  ).token_cost_usd;
};

// One authorized T0 smoke request: a single turn, one task, no retries.
const oneCall = perTurn("T0");

// Held-out Stage A futility screen: one attempt per task per arm.
const stageA = (tasks) =>
  DESIGN.arms.reduce((sum, arm) => sum + perTurn(arm) * TURNS_PER_ATTEMPT * tasks, 0);

const forecast = {
  schema_version: "1.0",
  purpose: "gate_h_exploratory_pilot_cost_forecast",
  is_estimate: true,
  no_live_call_has_been_made: true,
  pricing_snapshot_id: evidence.evidence_id,
  model: "gpt-5.6-luna",
  design: { ...DESIGN, total_attempts: DESIGN.tasks * DESIGN.arms.length * DESIGN.repetitions },
  assumed_tokens_per_turn: ASSUMED,
  turns_per_attempt: TURNS_PER_ATTEMPT,
  rows,
  forecast_total_usd: Number(total.toFixed(4)),
  recommended_budget_cap_usd: recommendedCap,
  scenarios: {
    one_call_t0_smoke: {
      attempts: 1,
      turns: 1,
      forecast_usd: Number(oneCall.toFixed(6)),
      recommended_cap_usd: Number((oneCall * 5).toFixed(2)),
      note: "Single authorized T0 request. Cap set well above forecast so the guard does not abort a legitimate call."
    },
    held_out_stage_a_4_tasks: { attempts: 16, forecast_usd: Number(stageA(4).toFixed(4)), recommended_cap_usd: Number((stageA(4) * 3).toFixed(2)) },
    held_out_stage_a_6_tasks: { attempts: 24, forecast_usd: Number(stageA(6).toFixed(4)), recommended_cap_usd: Number((stageA(6) * 3).toFixed(2)) },
    contaminated_48_attempt_fixture: {
      attempts: 48,
      forecast_usd: Number(total.toFixed(4)),
      execution_enabled: false,
      note: "Retained for history. Disabled as capability evidence; see tasks/gate-h/fixture-control.json."
    }
  },
  sol_comparison_arm_included: false,
  limitations: [
    "Token counts are assumptions; no live call has been made and none is authorized.",
    "Assumes no cache hits, so a cached run would cost less.",
    "Excludes tool charges, storage, and any regional or tier uplift.",
    "A Sol comparison arm is not costed here and is not part of this pilot.",
  ],
};

if (process.argv.includes("--json")) {
  process.stdout.write(`${JSON.stringify(forecast, null, 2)}\n`);
} else {
  for (const row of rows) {
    process.stdout.write(`${row.arm}: $${row.per_turn_usd.toFixed(5)}/turn x ${row.turns_per_attempt} turns x ${row.attempts} attempts = $${row.arm_total_usd.toFixed(3)}\n`);
  }
  process.stdout.write(`\ncontaminated 48-attempt fixture (DISABLED): $${total.toFixed(3)}\n`);
  process.stdout.write(`one authorized T0 smoke call: $${oneCall.toFixed(6)} (cap $${(oneCall * 5).toFixed(2)})\n`);
  process.stdout.write(`held-out Stage A, 4 tasks (16 attempts): $${stageA(4).toFixed(3)} (cap $${(stageA(4) * 3).toFixed(2)})\n`);
  process.stdout.write(`held-out Stage A, 6 tasks (24 attempts): $${stageA(6).toFixed(3)} (cap $${(stageA(6) * 3).toFixed(2)})\n`);
  process.stdout.write("\nAll figures are estimates. No live call has been made.\n");
}
