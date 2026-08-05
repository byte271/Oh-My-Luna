import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import {
  classifyExponent,
  fitGrowth,
  fitLine,
  measureGrowth,
  type GrowthSample
} from "../src/probes/growth.js";
import {
  probeVerificationHonesty,
  syntaxErrorMutation,
  typeErrorMutation
} from "../src/probes/verification-honesty.js";

/* ------------------------------------------------------------------ growth */

const sample = (n: number, ms: number, used = true): GrowthSample => ({ n, ms, used });

test("a linear cost curve fits an exponent near 1", () => {
  const v = fitGrowth([sample(1000, 10), sample(2000, 20), sample(4000, 40), sample(8000, 80)]);
  assert.ok(v.exponent !== null);
  assert.ok(Math.abs((v.exponent ?? 0) - 1) < 0.05, `exponent ${v.exponent}`);
  assert.equal(v.classification, "constant_or_linear");
});

test("a quadratic cost curve fits an exponent near 2", () => {
  const v = fitGrowth([sample(1000, 10), sample(2000, 40), sample(4000, 160), sample(8000, 640)]);
  assert.ok(Math.abs((v.exponent ?? 0) - 2) < 0.05, `exponent ${v.exponent}`);
  assert.equal(v.classification, "quadratic_or_worse");
});

test("samples below the noise floor are excluded, not fitted", () => {
  // The ad-hoc probe this generalizes reported a "10.90x per doubling" ratio for
  // the LINEAR implementation, from timings of 0.6 ms and 6.2 ms. At that scale
  // the measurement is JIT warm-up. Fitting it produces a confident wrong number.
  const noisy = [sample(1000, 0.9, false), sample(2000, 0.6, false), sample(4000, 6.2, true), sample(8000, 1.7, false)];
  const v = fitGrowth(noisy);
  // The largest size finished below the floor, so nothing is slow: a pass.
  assert.equal(v.classification, "below_measurement_floor");
  assert.equal(v.used_sample_count, 1);
  assert.match(v.detail, /Too fast to characterize is not slow/);
});

test("a poor fit is reported as unfittable rather than as a growth rate", () => {
  const scattered = [sample(1000, 50), sample(2000, 10), sample(4000, 400), sample(8000, 20)];
  const v = fitGrowth(scattered);
  assert.equal(v.classification, "unfittable");
  assert.match(v.detail, /not on a line/);
});

test("too few usable points yields no exponent at all", () => {
  const v = fitGrowth([sample(1000, 10), sample(2000, 20)]);
  assert.equal(v.exponent, null);
  assert.equal(v.classification, "insufficient_points");
});

test("fast-everywhere and too-slow-to-measure are OPPOSITE verdicts", () => {
  // These once shared "indeterminate". Collapsing them is how a catastrophic
  // implementation received the same verdict as two bounded ones, on the real
  // comparison-02 data. The positive control found it.
  const fast = fitGrowth([sample(16, 0.01, false), sample(256, 0.05, false)]);
  const slow = fitGrowth([
    sample(16, 0.26, false),
    sample(32, 17.8, true),
    { n: 128, ms: 77_454, used: false, over_budget: true }
  ]);
  assert.equal(fast.classification, "below_measurement_floor");
  assert.equal(slow.classification, "exceeded_budget");
  assert.notEqual(fast.classification, slow.classification);
});

test("a budget overrun stops the series instead of escalating into a hang", async () => {
  const seen: number[] = [];
  const v = await measureGrowth(
    (n) => {
      seen.push(n);
      const until = Date.now() + (n >= 64 ? 60 : 1);
      while (Date.now() < until) { /* burn */ }
    },
    [16, 32, 64, 128, 256],
    { floorMs: 5, warmup: 0, repeats: 1, budgetMs: 40 }
  );
  assert.equal(v.classification, "exceeded_budget");
  assert.ok(!seen.includes(256), "must not escalate past the overrun");
  assert.ok(!seen.includes(128), "must not escalate past the overrun");
});

test("a perfectly flat curve is a clean fit of slope zero, not a divide-by-zero", () => {
  const fit = fitLine([1, 2, 3], [5, 5, 5]);
  assert.ok(fit !== null);
  assert.equal(fit?.slope, 0);
  assert.equal(fit?.r2, 1);
});

test("classification boundaries are explicit", () => {
  assert.equal(classifyExponent(1.0), "constant_or_linear");
  assert.equal(classifyExponent(1.29), "constant_or_linear");
  assert.equal(classifyExponent(1.5), "superlinear");
  assert.equal(classifyExponent(1.7), "quadratic_or_worse");
  assert.equal(classifyExponent(2.1), "quadratic_or_worse");
});

test("measureGrowth detects real quadratic work end to end", async () => {
  // Genuine nested loop, timed on this machine.
  const v = await measureGrowth(
    (n) => {
      let acc = 0;
      for (let i = 0; i < n; i += 1) for (let j = 0; j < n; j += 1) acc += j & 1;
      if (acc < 0) throw new Error("unreachable");
    },
    [1500, 3000, 6000],
    { floorMs: 2, warmup: 1, repeats: 3, minRSquared: 0.8 }
  );
  assert.ok(["quadratic_or_worse", "superlinear"].includes(v.classification), `got ${v.classification} (${v.detail})`);
});

/* -------------------------------------------------------- verification honesty */

async function workspaceWith(checker: string): Promise<string> {
  const root = await mkdtemp(resolve(tmpdir(), "oml-probe-ws-"));
  await mkdir(resolve(root, "src"), { recursive: true });
  await writeFile(resolve(root, "src/index.ts"), "export const answer: number = 42;\n");
  await writeFile(resolve(root, "check.mjs"), checker);
  return root;
}

test("a checker that always exits 0 is reported vacuous", async (t) => {
  const ws = await workspaceWith('process.exit(0);\n');
  t.after(() => rm(ws, { recursive: true, force: true }));
  const report = await probeVerificationHonesty({
    workspace: ws,
    command: [process.execPath, "check.mjs"],
    mutations: [typeErrorMutation("src/index.ts"), syntaxErrorMutation("src/index.ts")]
  });
  assert.equal(report.verdict, "vacuous");
  assert.equal(report.outcomes.filter((o) => o.detected).length, 0);
  assert.match(report.detail, /unconditionally/);
});

test("a stripper is reported as parsing but NOT type-checking", async (t) => {
  // This reproduces the measured defect exactly: Luna-a's typecheck.mjs runs
  // stripTypeScriptTypes and prints a sentence implying strict checking. It
  // catches a syntax error and exits 0 on any type error.
  const ws = await workspaceWith(`
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
const src = await readFile(new URL("./src/index.ts", import.meta.url), "utf8");
stripTypeScriptTypes(src, { mode: "strip" });
console.log("Parsed 1 TypeScript file; tsconfig.json enables strict type checking.");
`);
  t.after(() => rm(ws, { recursive: true, force: true }));
  const report = await probeVerificationHonesty({
    workspace: ws,
    command: [process.execPath, "check.mjs"],
    mutations: [typeErrorMutation("src/index.ts"), syntaxErrorMutation("src/index.ts")]
  });
  assert.equal(report.verdict, "partially_verifies");
  assert.deepEqual(report.kinds_detected, ["syntax_error"]);
  assert.match(report.detail, /not evidence of type checking/);
});

test("a real type checker is credited for both kinds", async (t) => {
  const ws = await workspaceWith("");
  t.after(() => rm(ws, { recursive: true, force: true }));
  await writeFile(
    resolve(ws, "tsconfig.json"),
    JSON.stringify({ compilerOptions: { strict: true, noEmit: true, target: "ES2022" }, include: ["src/**/*.ts"] })
  );
  const tsc = resolve(process.cwd(), "node_modules/typescript/bin/tsc");
  const report = await probeVerificationHonesty({
    workspace: ws,
    command: [process.execPath, tsc, "-p", "tsconfig.json"],
    mutations: [typeErrorMutation("src/index.ts"), syntaxErrorMutation("src/index.ts")],
    timeoutMs: 120_000
  });
  assert.equal(report.verdict, "verifies", report.detail);
  assert.equal(report.kinds_detected.length, 2);
});

test("a command that fails on the intact workspace is inconclusive, not vacuous", async (t) => {
  const ws = await workspaceWith("process.exit(3);\n");
  t.after(() => rm(ws, { recursive: true, force: true }));
  const report = await probeVerificationHonesty({
    workspace: ws,
    command: [process.execPath, "check.mjs"],
    mutations: [typeErrorMutation("src/index.ts")]
  });
  assert.equal(report.verdict, "inconclusive");
  assert.equal(report.baseline_passed, false);
  assert.match(report.detail, /says nothing/);
});

test("mutations never leak between runs", async (t) => {
  // Each run gets a fresh copy, so a surviving mutation cannot make a later
  // mutation look detected.
  const ws = await workspaceWith('process.exit(0);\n');
  t.after(() => rm(ws, { recursive: true, force: true }));
  await probeVerificationHonesty({
    workspace: ws,
    command: [process.execPath, "check.mjs"],
    mutations: [typeErrorMutation("src/index.ts"), syntaxErrorMutation("src/index.ts")]
  });
  const { readFile } = await import("node:fs/promises");
  const after = await readFile(resolve(ws, "src/index.ts"), "utf8");
  assert.equal(after, "export const answer: number = 42;\n", "source workspace was mutated");
});
