import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import test from "node:test";
import { classifyChildResult, EVALUATOR_EXIT, interpretEvaluatorExit } from "../src/heldout/outcome.js";

test("a SIGKILLed child is not reported as a test failure", () => {
  // The v1 evaluator's guard was `result.code === -1`, which never fires for a
  // signal-killed child, so `:97` returned 17 — the same code as a clean test
  // failure. The one symptom by which a hang could surface was therefore
  // unattributable in the receipts.
  const classified = classifyChildResult({ code: null, signal: "SIGKILL", timedOut: true });
  assert.equal(classified.outcome, "timed_out");
  assert.equal(classified.exitCode, EVALUATOR_EXIT.TIMED_OUT);
  assert.notEqual(classified.exitCode, EVALUATOR_EXIT.TESTS_FAILED);
  assert.equal(classified.attributable_to_model, false);
});

test("Node really does report code null for a signal-killed child", async () => {
  // Guards the premise above by observation rather than inference.
  const observed = await new Promise<{ code: number | null; signal: string | null }>((res) => {
    const child = spawn(process.execPath, ["-e", "setTimeout(() => {}, 30000)"], {
      stdio: ["ignore", "ignore", "ignore"]
    });
    setTimeout(() => child.kill("SIGKILL"), 200);
    child.on("close", (code, signal) => res({ code, signal }));
  });
  assert.equal(observed.code, null);
  assert.equal(observed.signal, "SIGKILL");
  // And this is exactly the input that v1 mapped onto 17.
  assert.equal(observed.code === 0 ? 0 : 17, 17);
});

test("process.exit inside a try does not run its finally", async () => {
  // The v1 evaluator's cleanup lived in a `finally` while every terminal path
  // called `process.exit()`, so the recursive workspace copy it made was never
  // removed — one abandoned repository copy per evaluation, twenty per Stage A.
  // Only the injection-error path cleaned up, and it did so explicitly, which is
  // what makes the omission a slip rather than a design.
  const printed = await new Promise<string>((res) => {
    const child = spawn(process.execPath, ["-e", 'try { console.log("try"); process.exit(17); } finally { console.log("finally"); }'], {
      stdio: ["ignore", "pipe", "ignore"]
    });
    let out = "";
    child.stdout.on("data", (c) => (out += c));
    child.on("close", () => res(out));
  });
  assert.match(printed, /try/);
  assert.doesNotMatch(printed, /finally/, "if this ever passes, the v2 evaluator can go back to process.exit()");
});

test("a kill we did not send is distinguished from our own timeout", () => {
  const classified = classifyChildResult({ code: null, signal: "SIGSEGV", timedOut: false });
  assert.equal(classified.outcome, "killed");
  assert.equal(classified.exitCode, EVALUATOR_EXIT.KILLED);
  assert.equal(classified.attributable_to_model, false);
});

test("an ordinary nonzero exit is a test failure and is attributable", () => {
  const classified = classifyChildResult({ code: 1, signal: null, timedOut: false });
  assert.equal(classified.outcome, "tests_failed");
  assert.equal(classified.exitCode, EVALUATOR_EXIT.TESTS_FAILED);
  assert.equal(classified.attributable_to_model, true);
});

test("exit 0 is the only success", () => {
  assert.equal(classifyChildResult({ code: 0, signal: null, timedOut: false }).outcome, "passed");
  for (const code of [1, 2, 17, 18, 19, 127]) {
    assert.notEqual(classifyChildResult({ code, signal: null, timedOut: false }).outcome, "passed");
  }
});

test("a spawn failure is never read as a model result", () => {
  const classified = classifyChildResult({ code: null, signal: null, timedOut: false, spawnFailed: true });
  assert.equal(classified.exitCode, EVALUATOR_EXIT.RUNNER_UNAVAILABLE);
  assert.equal(classified.attributable_to_model, false);
});

test("the runner reads back each evaluator code with the same meaning", () => {
  assert.equal(interpretEvaluatorExit(EVALUATOR_EXIT.PASSED).outcome, "passed");
  assert.equal(interpretEvaluatorExit(EVALUATOR_EXIT.TESTS_FAILED).outcome, "tests_failed");
  assert.equal(interpretEvaluatorExit(EVALUATOR_EXIT.TIMED_OUT).outcome, "timed_out");
  assert.equal(interpretEvaluatorExit(EVALUATOR_EXIT.KILLED).outcome, "killed");
  assert.equal(interpretEvaluatorExit(null).attributable_to_model, false);
  assert.equal(interpretEvaluatorExit(73).attributable_to_model, false);
});

test("only pass and test-failure license a statement about the model", () => {
  const attributable = ([0, 17] as const).map((c) => interpretEvaluatorExit(c).attributable_to_model);
  const notAttributable = ([18, 19, 71, 72, 73, null] as const).map((c) => interpretEvaluatorExit(c).attributable_to_model);
  assert.deepEqual(attributable, [true, true]);
  assert.deepEqual(notAttributable, [false, false, false, false, false, false]);
});
