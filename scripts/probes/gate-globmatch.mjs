// Acceptance gate for the GlobMatch task, run against every arm.
//
// The workload below is authored with the task, not chosen after seeing
// candidates — it is the same one pre-registered in COMPARISON.md. A gate whose
// workload is picked once results exist is not a gate.
//
// The positive control runs first and the gate is REQUIRED to reject it. A gate
// that accepts a deliberately broken implementation accepts anything, and the
// first scoring run of this comparison was exactly that situation.
//
// Exit codes — a gate whose exit code does not reflect its verdict is not a
// gate, which is the defect this file itself had until 2026-08-05:
//   0  the control was rejected AND every present arm passed
//   1  the control was ACCEPTED — the gate accepts anything, verdicts are void
//   2  at least one arm was rejected
//
// Run: npm run gate:globmatch

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

import { runGate, formatFeedback } from "../../dist/src/probes/gate.js";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const D = resolve(root, "Luna-example/02-globmatch-luna-skill-vs-opus5");
const shim = resolve(root, ".oml-runs/.probe-shim");

const PATTERN = `${"a*".repeat(6)}b`;

/** Pre-registered, authored with the prompt. */
const spec = {
  task: "globmatch",
  growth: [
    {
      id: "star-heavy non-match",
      entry: "src/index.ts",
      exportName: "match",
      sizes: [16, 32, 64, 128, 256],
      accept: ["below_measurement_floor", "constant_or_linear"],
      options: { floorMs: 5, warmup: 1, repeats: 3, budgetMs: 10_000 },
      buildArgs: (n) => [PATTERN, "a".repeat(n)]
    }
  ],
  honesty: [
    {
      id: "typecheck",
      script: "typecheck",
      mutationTarget: "src/index.ts",
      accept: ["verifies"],
      env: { PATH: process.env.PATH ?? "" }
    }
  ],
  requireSkillCompliance: true
};

const CONTROL = {
  ...spec,
  task: "globmatch/positive-control",
  growth: [{ ...spec.growth[0], entry: "naive.mjs" }],
  honesty: [],
  requireSkillCompliance: false
};

process.stdout.write("=== positive control: the gate MUST reject this ===\n");
const control = await runGate(resolve(D, "positive-control"), CONTROL);
process.stdout.write(`${formatFeedback(control)}\n\n`);
if (control.passed) {
  process.stdout.write("FATAL: the gate accepted a deliberately broken implementation.\n");
  process.stdout.write("It accepts anything. Every verdict below is meaningless.\n");
  process.exit(1);
}

let rejected = 0;
for (const arm of ["luna-skill", "luna-baseline", "opus5-baseline"]) {
  if (!existsSync(resolve(D, arm, "src/index.ts"))) continue;
  process.stdout.write(`${"=".repeat(70)}\n=== ${arm}\n${"=".repeat(70)}\n`);
  const report = await runGate(resolve(D, arm), spec);
  process.stdout.write(`${formatFeedback(report)}\n`);
  const advisory = report.findings.filter((f) => !f.passed && f.severity === "advisory");
  for (const a of advisory) process.stdout.write(`\n[advisory] ${a.check}: ${a.summary}\n`);
  process.stdout.write("\n");
  if (!report.passed) rejected += 1;
}

process.stdout.write(`${rejected} arm(s) rejected by the gate.\n`);
// Exit 2 rather than 0: a rejected arm is the finding, and a caller that checks
// only the exit code must not be told everything is fine.
process.exit(rejected > 0 ? 2 : 0);
