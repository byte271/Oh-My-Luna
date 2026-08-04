// Deterministic evaluator for a held-out task — protocol v2.
//
// Injects the regression test from the corrected commit into a copy of the
// candidate workspace and runs it. The test never exists in the workspace a
// model sees; it is added only at evaluation time, so a solver cannot read the
// repair out of its own working tree. That property is carried forward from v1
// unchanged.
//
// Three defects in the v1 evaluator are corrected here.
//
// 1. A hang was recorded as an ordinary test failure. v1 killed a runaway
//    runner with SIGKILL after the timeout; a signal-killed child reports
//    `code === null` at close, so the `code === -1` guard never fired and the
//    final line returned 17 — the same code as a clean test failure. The one
//    symptom by which a complexity or allocation defect could surface at all
//    was therefore unattributable in the receipts.
//
// 2. The scratch directory leaked on every evaluation. `process.exit()` inside
//    a `try` does not run its `finally`, so the recursive workspace copy was
//    never removed on the success or failure path — only on the injection-error
//    path, which cleaned up explicitly. Over a 20-attempt Stage A that is
//    twenty abandoned repository copies. This version sets `process.exitCode`
//    and returns, so the `finally` runs.
//
// 3. The evaluator inherited the parent environment, credential included. v1's
//    own comment claimed "the evaluator gets no treatment identity and no
//    credential", but that was only true of its grandchild test runner;
//    `run-stage-a.mjs` spawned the evaluator itself with the full `process.env`.
//    The v2 runner passes a filtered environment, and this script re-filters.
//
// Exit codes:
//   0   the regression test passes
//   17  the regression test ran and failed (the expected base-state result)
//   18  the runner was killed by this evaluator's timeout
//   19  the runner died on a signal we did not send
//   71  usage error
//   72  workspace or injection failure
//   73  the runner could not be executed
//
// A receipt line is written to stderr as JSON with `signal` and `duration_ms`,
// so a 17 can be told apart from an 18 after the fact even from logs alone.
//
// Usage: node scripts/gate-h-heldout/v2/evaluate.mjs <task-id> <workspace>

import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

import { classifyChildResult, EVALUATOR_EXIT } from "../../../dist/src/heldout/outcome.js";

const root = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const cache = resolve(root, ".gate-h-heldout-cache");

const [taskId, workspaceArg] = process.argv.slice(2);
if (!taskId || !workspaceArg || process.argv.length !== 4) process.exit(EVALUATOR_EXIT.USAGE);
const workspace = resolve(workspaceArg);

const TIMEOUT_MS = 300_000;

function run(argv, cwd, env = {}, timeoutMs = TIMEOUT_MS) {
  return new Promise((res) => {
    const startedAt = Date.now();
    const child = spawn(argv[0], argv.slice(1), {
      cwd,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      // Filtered environment: no treatment identity, no credential. Repository
      // code under test executes with the host user's authority regardless —
      // filesystem copying is not containment — so this reduces what a hostile
      // repository can read, and does not make the evaluator a sandbox.
      env: { PATH: process.env.PATH, HOME: process.env.HOME, ...env }
    });
    let out = "";
    let err = "";
    let timedOut = false;
    let spawnFailed = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);
    child.stdout.on("data", (c) => (out += c));
    child.stderr.on("data", (c) => (err += c));
    child.on("error", () => {
      spawnFailed = true;
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      res({ code, signal, timedOut, spawnFailed, out, err, duration_ms: Date.now() - startedAt });
    });
  });
}

const control = JSON.parse(
  await readFile(resolve(root, "tasks/gate-h-heldout/tasks", taskId, "control", "evaluator.json"), "utf8")
);
const bare = resolve(cache, "repos", control.repository.split("/").pop(), ".git");

// Evaluate in a detached copy so the candidate workspace is never mutated and
// the injected test cannot persist into a later arm.
const scratch = await mkdtemp(resolve(tmpdir(), "oml-heldout-"));
const evalDir = resolve(scratch, "workspace");

const receipt = {
  task_id: taskId,
  outcome: null,
  exit_code: null,
  signal: null,
  duration_ms: null,
  timeout_ms: TIMEOUT_MS
};

try {
  await cp(workspace, evalDir, { recursive: true });

  let injectionFailed = false;
  for (const file of control.injected_test_files) {
    const blob = await run(["git", "-C", bare, "show", `${control.corrected_commit}:${file}`], root);
    if (blob.code !== 0) {
      injectionFailed = true;
      break;
    }
    const target = resolve(evalDir, file);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, blob.out);
  }

  if (injectionFailed) {
    receipt.outcome = "injection_failed";
    receipt.exit_code = EVALUATOR_EXIT.WORKSPACE;
    process.exitCode = EVALUATOR_EXIT.WORKSPACE;
  } else {
    let result;
    if (control.language === "python") {
      result = await run(["python3", "-m", "pytest", "-x", "-q", ...control.injected_test_files], evalDir, {
        PYTHONPATH: evalDir,
        PYTHONDONTWRITEBYTECODE: "1"
      });
    } else if (control.runner === "vitest") {
      result = await run(["npx", "--no-install", "vitest", "run", ...control.injected_test_files], evalDir, { CI: "1" });
    } else {
      result = await run(
        ["npx", "--no-install", "tap", "--disable-coverage", "--allow-empty-coverage", ...control.injected_test_files],
        evalDir,
        { CI: "1" }
      );
    }

    // Bounded output so a runaway runner cannot flood a receipt.
    process.stdout.write((result.out || "").slice(-4000));

    const classified = classifyChildResult(result);
    receipt.outcome = classified.outcome;
    receipt.exit_code = classified.exitCode;
    receipt.signal = classified.signal;
    receipt.duration_ms = result.duration_ms;
    receipt.attributable_to_model = classified.attributable_to_model;
    process.exitCode = classified.exitCode;
  }
} catch (error) {
  receipt.outcome = "workspace_error";
  receipt.exit_code = EVALUATOR_EXIT.WORKSPACE;
  receipt.error = String(error?.message ?? error).slice(0, 500);
  process.exitCode = EVALUATOR_EXIT.WORKSPACE;
} finally {
  // Reached on every path, because nothing above calls process.exit().
  await rm(scratch, { recursive: true, force: true });
  process.stderr.write(`${JSON.stringify(receipt)}\n`);
}
