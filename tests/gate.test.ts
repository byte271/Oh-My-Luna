import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { formatFeedback, runGate, type GateSpec } from "../src/probes/gate.js";

async function workspace(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(resolve(tmpdir(), "oml-gate-"));
  for (const [path, contents] of Object.entries(files)) {
    const full = resolve(root, path);
    await mkdir(resolve(full, ".."), { recursive: true });
    await writeFile(full, contents);
  }
  return root;
}

const growthSpec = (accept: readonly string[]): GateSpec => ({
  task: "t",
  growth: [
    {
      id: "adversarial",
      entry: "impl.mjs",
      exportName: "work",
      sizes: [200, 400, 800],
      accept,
      options: { floorMs: 2, warmup: 0, repeats: 1, budgetMs: 3_000, minRSquared: 0.7 },
      buildArgs: (n) => [n]
    }
  ]
});

test("a quadratic deliverable is rejected with an actionable remedy", async (t) => {
  // Wall-time proportional to n^2 rather than an iteration count, so the test
  // measures the gate rather than the host. An earlier version used a nested
  // loop whose absolute duration depended on machine speed, and on a fast host
  // every sample fell below the noise floor and the gate correctly passed it.
  const ws = await workspace({
    "impl.mjs": "export function work(n){const u=Date.now()+(n*n)/20000;while(Date.now()<u){}return n;}\n"
  });
  t.after(() => rm(ws, { recursive: true, force: true }));
  const report = await runGate(ws, growthSpec(["below_measurement_floor", "constant_or_linear"]));
  assert.equal(report.passed, false);
  assert.equal(report.blocking_failures, 1);

  const feedback = formatFeedback(report);
  // A gate that only says "rejected" makes the next attempt a guess.
  assert.match(feedback, /REJECTED/);
  assert.match(feedback, /individually legal/);
  assert.match(feedback, /bound it/);
  assert.match(feedback, /measurement this harness took/);
});

test("a linear deliverable passes the same gate", async (t) => {
  // n/25 ms, so the SMALLEST size clears the 2 ms floor with margin. An earlier
  // version used n/100, putting n=200 at 1.98 ms — just under — and the probe
  // correctly reported insufficient_points. The probe was right; the test had no
  // margin.
  const ws = await workspace({ "impl.mjs": "export function work(n){const u=Date.now()+n/25;while(Date.now()<u){}return n;}\n" });
  t.after(() => rm(ws, { recursive: true, force: true }));
  const report = await runGate(ws, growthSpec(["below_measurement_floor", "constant_or_linear"]));
  assert.equal(report.passed, true);
});

test("a passing gate never claims the code is correct", async (t) => {
  const ws = await workspace({ "impl.mjs": "export function work(n){return n;}\n" });
  t.after(() => rm(ws, { recursive: true, force: true }));
  const feedback = formatFeedback(await runGate(ws, growthSpec(["below_measurement_floor", "constant_or_linear"])));
  assert.match(feedback, /not a statement that the code is correct/);
});

test("a missing export is a blocking finding, not a silent pass", async (t) => {
  const ws = await workspace({ "impl.mjs": "export const other = 1;\n" });
  t.after(() => rm(ws, { recursive: true, force: true }));
  const report = await runGate(ws, growthSpec(["below_measurement_floor"]));
  assert.equal(report.passed, false);
  assert.match(report.findings[0]?.remedy ?? "", /Export a function named work/);
});

test("a vacuous typecheck is rejected and told why", async (t) => {
  const ws = await workspace({
    "package.json": JSON.stringify({ scripts: { typecheck: "node check.mjs" } }),
    "check.mjs": "process.exit(0);\n",
    "src/index.ts": "export const a: number = 1;\n"
  });
  t.after(() => rm(ws, { recursive: true, force: true }));
  const report = await runGate(ws, {
    task: "t",
    honesty: [{ id: "typecheck", script: "typecheck", mutationTarget: "src/index.ts", accept: ["verifies"] }]
  });
  assert.equal(report.passed, false);
  assert.match(formatFeedback(report), /reports success unconditionally/);
});

test("a typecheck that fails on its own unmodified code is rejected as inconclusive", async (t) => {
  // The luna-baseline case: nothing can be concluded from a defect's behaviour
  // when the baseline itself does not pass.
  const ws = await workspace({
    "package.json": JSON.stringify({ scripts: { typecheck: "node check.mjs" } }),
    "check.mjs": "process.exit(1);\n",
    "src/index.ts": "export const a: number = 1;\n"
  });
  t.after(() => rm(ws, { recursive: true, force: true }));
  const report = await runGate(ws, {
    task: "t",
    honesty: [{ id: "typecheck", script: "typecheck", mutationTarget: "src/index.ts", accept: ["verifies"] }]
  });
  assert.equal(report.passed, false);
  assert.match(formatFeedback(report), /does not pass on your own unmodified code/);
});

test("skill compliance is advisory, never blocking", async (t) => {
  // Blocking on paperwork while passing on substance is the inversion this
  // project keeps finding. A missing VERIFICATION.md must not fail a
  // deliverable whose measured behaviour is sound.
  const ws = await workspace({ "impl.mjs": "export function work(n){return n;}\n" });
  t.after(() => rm(ws, { recursive: true, force: true }));
  const report = await runGate(ws, { ...growthSpec(["below_measurement_floor"]), requireSkillCompliance: true });
  const compliance = report.findings.find((f) => f.check === "skill_compliance");
  assert.equal(compliance?.passed, false);
  assert.equal(compliance?.severity, "advisory");
  assert.equal(report.passed, true, "advisory findings must not fail the gate");
});
