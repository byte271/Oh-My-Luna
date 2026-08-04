/**
 * Evaluator outcome semantics for protocol v2.
 *
 * v1's evaluator collapsed two different events into one exit code. It kills a
 * runaway test runner with SIGKILL after the timeout; a signal-killed child
 * reports `code === null` at `close`, so the `code === -1` guard never fired and
 * the final line returned **17** — the same code as a clean, fast test failure.
 *
 * Confirmed by execution rather than inference:
 *
 * ```
 * $ node -e 'const{spawn}=require("child_process");
 *            const c=spawn("node",["-e","setTimeout(()=>{},60000)"]);
 *            setTimeout(()=>c.kill("SIGKILL"),300);
 *            c.on("close",(code,signal)=>console.log({code,signal}))'
 * { code: null, signal: "SIGKILL" }
 * ```
 *
 * Why it matters beyond tidiness: a hang is the one symptom by which a
 * complexity or allocation defect can surface at all under a pass/fail
 * criterion. Recording it as "the model's fix was wrong" destroys the only
 * evidence that a *different* kind of defect was present. It also makes the
 * receipts unable to answer "did the suite run?", which is a harness question,
 * not a capability question.
 *
 * `timed_out` and `killed` are therefore distinct codes, and `signal` and
 * `duration_ms` are recorded per attempt.
 */

export const EVALUATOR_EXIT = {
  /** The injected regression test passed. The only success. */
  PASSED: 0,
  /** The injected regression test ran to completion and failed. */
  TESTS_FAILED: 17,
  /** The runner was killed by the evaluator's own timeout. */
  TIMED_OUT: 18,
  /** The runner died on a signal the evaluator did not send. */
  KILLED: 19,
  /** Usage error: wrong argument count. */
  USAGE: 71,
  /** Workspace copy or test injection failed. */
  WORKSPACE: 72,
  /** The runner binary could not be executed at all. */
  RUNNER_UNAVAILABLE: 73
} as const;

export type EvaluatorExitCode = (typeof EVALUATOR_EXIT)[keyof typeof EVALUATOR_EXIT];

export type EvaluationOutcome =
  | "passed"
  | "tests_failed"
  | "timed_out"
  | "killed"
  | "runner_unavailable";

export interface ChildResult {
  /** Exit code, or null when the child was terminated by a signal. */
  readonly code: number | null;
  /** Terminating signal name, or null. */
  readonly signal: string | null;
  /** True when the evaluator's own timer fired and sent the kill. */
  readonly timedOut: boolean;
  /** True when the child could not be spawned. */
  readonly spawnFailed?: boolean;
}

export interface ClassifiedOutcome {
  readonly outcome: EvaluationOutcome;
  readonly exitCode: EvaluatorExitCode;
  readonly signal: string | null;
  /**
   * Whether this outcome licenses any statement about the model's repair. A
   * timeout or a missing runner does not.
   */
  readonly attributable_to_model: boolean;
}

/**
 * Maps a child-process result onto an evaluator exit code.
 *
 * The ordering matters: `spawnFailed` and `timedOut` are checked before the
 * exit code, because a killed child's `code` is `null` and would otherwise fall
 * through to the failure branch — which is exactly the v1 bug.
 */
export function classifyChildResult(result: ChildResult): ClassifiedOutcome {
  if (result.spawnFailed === true) {
    return {
      outcome: "runner_unavailable",
      exitCode: EVALUATOR_EXIT.RUNNER_UNAVAILABLE,
      signal: result.signal,
      attributable_to_model: false
    };
  }
  if (result.timedOut) {
    return {
      outcome: "timed_out",
      exitCode: EVALUATOR_EXIT.TIMED_OUT,
      signal: result.signal,
      attributable_to_model: false
    };
  }
  if (result.code === null) {
    // Killed by something other than our timer: OOM killer, operator, or the
    // process group going down. Not a test result either way.
    return {
      outcome: "killed",
      exitCode: EVALUATOR_EXIT.KILLED,
      signal: result.signal,
      attributable_to_model: false
    };
  }
  if (result.code === 0) {
    return {
      outcome: "passed",
      exitCode: EVALUATOR_EXIT.PASSED,
      signal: null,
      attributable_to_model: true
    };
  }
  return {
    outcome: "tests_failed",
    exitCode: EVALUATOR_EXIT.TESTS_FAILED,
    signal: null,
    attributable_to_model: true
  };
}

/**
 * Interprets an evaluator exit code from the runner's side.
 *
 * Success is exactly `EVALUATOR_EXIT.PASSED`. Everything else is a
 * non-success, but only some non-successes say anything about the model, and
 * the receipts must keep those apart.
 */
export function interpretEvaluatorExit(code: number | null): ClassifiedOutcome {
  switch (code) {
    case EVALUATOR_EXIT.PASSED:
      return { outcome: "passed", exitCode: EVALUATOR_EXIT.PASSED, signal: null, attributable_to_model: true };
    case EVALUATOR_EXIT.TESTS_FAILED:
      return { outcome: "tests_failed", exitCode: EVALUATOR_EXIT.TESTS_FAILED, signal: null, attributable_to_model: true };
    case EVALUATOR_EXIT.TIMED_OUT:
      return { outcome: "timed_out", exitCode: EVALUATOR_EXIT.TIMED_OUT, signal: null, attributable_to_model: false };
    case EVALUATOR_EXIT.KILLED:
      return { outcome: "killed", exitCode: EVALUATOR_EXIT.KILLED, signal: null, attributable_to_model: false };
    default:
      return {
        outcome: "runner_unavailable",
        exitCode: EVALUATOR_EXIT.RUNNER_UNAVAILABLE,
        signal: null,
        attributable_to_model: false
      };
  }
}
