// Runs every v2 stub and asserts the outcome each one is supposed to produce.
//
// v1 shipped four stubs and a paragraph in SKILL.md telling an operator what to
// expect from each. Nothing checked it. That is how "20/20 PASS" came to be read
// as evidence the pipeline was sound, when what it actually demonstrated was
// that a stub holding the corrected file can make the apply-and-evaluate path
// succeed — a much narrower claim, and one that says nothing about whether the
// prompt was adequate.
//
// Each expectation below is a property the harness must have, written as an
// assertion so it fails loudly rather than being eyeballed:
//
//   oracle  every attempt passes         — the apply-and-evaluate path works
//   noop    every attempt fails at the
//           evaluator, with zero diff
//           hunks                        — the base state genuinely fails, AND the
//                                          prompt carries the source byte-exactly,
//                                          since the stub reconstructs the file
//                                          from the prompt alone
//   prose   every attempt is rejected
//           before evaluation            — a fluent success claim carrying no change
//                                          is a failure, not partial credit
//   unseen  every attempt fails at the
//           evaluator                    — a plausible hallucinated file is not a
//                                          repair. This is the regression test for
//                                          the unseen-source defect
//   mixed   the continuation rule fires  — the positive branch is exercised before
//                                          any real data exists
//
// Usage:
//   node scripts/gate-h-heldout/v2/run-all-stubs.mjs [--limit N]

import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const limitIndex = process.argv.indexOf("--limit");
const limitArgs = limitIndex > -1 ? ["--limit", process.argv[limitIndex + 1]] : [];

function runStub(stub) {
  return new Promise((res) => {
    const child = spawn(
      process.execPath,
      [resolve(root, "scripts/gate-h-heldout/v2/run-stage-a.mjs"), "--dry-run", stub, ...limitArgs],
      { cwd: root, stdio: ["ignore", "pipe", "pipe"] }
    );
    let out = "";
    let err = "";
    child.stdout.on("data", (c) => (out += c));
    child.stderr.on("data", (c) => (err += c));
    child.on("close", (code) => res({ code, out, err }));
  });
}

async function summaryOf(stdout) {
  const match = /receipts: (.+summary\.json)/.exec(stdout);
  if (match === null) return null;
  return JSON.parse(await readFile(match[1].trim(), "utf8"));
}

const EXPECTATIONS = {
  oracle: (s) => {
    const failures = s.attempts.filter((a) => a.task_success !== true);
    return failures.length === 0
      ? null
      : `${failures.length}/${s.attempts.length} attempts failed; the apply-and-evaluate path is broken`;
  },
  noop: (s) => {
    const passes = s.attempts.filter((a) => a.task_success === true);
    if (passes.length > 0) return `${passes.length} attempts passed on the unmodified base state`;
    const notEvaluated = s.attempts.filter((a) => a.status !== "evaluated");
    if (notEvaluated.length > 0) {
      // The stub reconstructs the base file from the prompt. If it could not,
      // the prompt does not carry the source — which is the v1 defect itself.
      return `${notEvaluated.length} attempts never reached the evaluator (${notEvaluated[0]?.output_rejection ?? "?"}); the prompt may not carry the source`;
    }
    const drifted = s.attempts.filter((a) => (a.diff?.total_hunks ?? -1) !== 0);
    if (drifted.length > 0) return `${drifted.length} attempts differ from the base file; the prompt does not round-trip the source`;
    return null;
  },
  prose: (s) => {
    const wrong = s.attempts.filter((a) => a.output_rejection !== "not_json");
    return wrong.length === 0 ? null : `${wrong.length} attempts were not rejected as prose`;
  },
  unseen: (s) => {
    const passes = s.attempts.filter((a) => a.task_success === true);
    if (passes.length > 0) return `${passes.length} hallucinated files scored as repairs`;
    const notEvaluated = s.attempts.filter((a) => a.status !== "evaluated");
    return notEvaluated.length === 0 ? null : `${notEvaluated.length} attempts never reached the evaluator`;
  },
  mixed: (s) =>
    s.continuation_rule_passed === true ? null : "the continuation rule's positive branch did not fire"
};

let failed = 0;
for (const [stub, expectation] of Object.entries(EXPECTATIONS)) {
  const result = await runStub(stub);
  const summary = await summaryOf(result.out);
  if (summary === null) {
    process.stdout.write(`FAIL  ${stub.padEnd(8)} run produced no summary (exit ${result.code})\n${result.err.slice(0, 400)}\n`);
    failed += 1;
    continue;
  }
  const problem = expectation(summary);
  if (problem === null) {
    process.stdout.write(`PASS  ${stub.padEnd(8)} ${summary.attempts_executed} attempts, $${summary.spent_usd.toFixed(4)}\n`);
  } else {
    process.stdout.write(`FAIL  ${stub.padEnd(8)} ${problem}\n`);
    failed += 1;
  }
}

process.stdout.write(
  failed === 0
    ? "\nall stub expectations hold. Orchestration only — no provider was contacted and this is not a model result.\n"
    : `\n${failed} stub expectation(s) violated.\n`
);
process.exit(failed === 0 ? 0 : 1);
