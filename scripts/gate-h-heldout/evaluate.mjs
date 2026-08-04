// Deterministic evaluator for a held-out task.
//
// Injects the regression test from the corrected commit into a copy of the
// candidate workspace and runs it. The test never exists in the workspace a
// model sees; it is added only at evaluation time, so a solver cannot read the
// repair out of its own working tree.
//
// Exit codes:
//   0  the regression test passes
//   17 the regression test fails (the expected base-state result)
//   71 usage error
//   72 workspace or injection failure
//   73 runner could not be executed
//
// Usage: node scripts/gate-h-heldout/evaluate.mjs <task-id> <workspace>

import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { spawn } from "node:child_process";

const root = resolve(new URL("../..", import.meta.url).pathname);
const cache = resolve(root, ".gate-h-heldout-cache");

const [taskId, workspaceArg] = process.argv.slice(2);
if (!taskId || !workspaceArg || process.argv.length !== 4) process.exit(71);
const workspace = resolve(workspaceArg);

function run(argv, cwd, env = {}, timeoutMs = 300_000) {
  return new Promise((res) => {
    const child = spawn(argv[0], argv.slice(1), {
      cwd,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      // Filtered environment: the evaluator gets no treatment identity and no
      // credential.
      env: { PATH: process.env.PATH, HOME: process.env.HOME, ...env }
    });
    let out = "";
    let err = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.stdout.on("data", (c) => (out += c));
    child.stderr.on("data", (c) => (err += c));
    child.on("error", () => {
      clearTimeout(timer);
      res({ code: -1, out, err });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      res({ code, out, err });
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
try {
  await cp(workspace, evalDir, { recursive: true });

  for (const file of control.injected_test_files) {
    const blob = await run(["git", "-C", bare, "show", `${control.corrected_commit}:${file}`], root);
    if (blob.code !== 0) {
      await rm(scratch, { recursive: true, force: true });
      process.exit(72);
    }
    const target = resolve(evalDir, file);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, blob.out);
  }

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
  if (result.code === -1) process.exit(73);
  process.exit(result.code === 0 ? 0 : 17);
} finally {
  await rm(scratch, { recursive: true, force: true });
}
