// Validates held-out candidates end to end.
//
// For each candidate:
//   1. materialize base (fix^) and corrected (fix) worktrees
//   2. install dependencies from a clean state
//   3. copy the regression test from the fix commit into BOTH worktrees
//   4. run that test against base      -> must FAIL
//   5. run that test against corrected -> must PASS
//
// A candidate that does not show both is rejected, and the rejection reason is
// recorded rather than dropped. The test is evaluator-only: it is injected at
// evaluation time and never lives in a model workspace.
//
// Usage: node scripts/gate-h-heldout/validate-candidates.mjs [--only <id,id>] [--limit N]

import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawn } from "node:child_process";

const root = resolve(new URL("../..", import.meta.url).pathname);
const cache = resolve(root, ".gate-h-heldout-cache");

const SETUP_TIMEOUT_MS = 600_000;
const EVAL_TIMEOUT_MS = 300_000;

function run(argv, cwd, timeoutMs = EVAL_TIMEOUT_MS, env = {}) {
  return new Promise((res) => {
    const child = spawn(argv[0], argv.slice(1), {
      cwd,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, ...env }
    });
    let out = "";
    let err = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.stdout.on("data", (c) => (out += c));
    child.stderr.on("data", (c) => (err += c));
    child.on("error", () => {
      clearTimeout(timer);
      res({ code: -1, out, err, timedOut: false });
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      res({ code, out, err, timedOut: signal === "SIGKILL" });
    });
  });
}

async function worktree(repoName, commit, label) {
  const bare = resolve(cache, "repos", repoName, ".git");
  const path = resolve(cache, "worktrees", `${repoName}-${label}-${commit.slice(0, 8)}`);
  if (existsSync(resolve(path, ".git"))) return path;
  await run(["git", "-C", bare, "worktree", "prune"], root);
  const result = await run(["git", "-C", bare, "worktree", "add", "--detach", path, commit], root, SETUP_TIMEOUT_MS);
  if (result.code !== 0) throw new Error(`worktree failed: ${result.err.slice(0, 300)}`);
  return path;
}

async function installDeps(path, language, repoName) {
  if (language === "python") return { installed: "none (stdlib only)", ms: 0 };
  const started = Date.now();
  if (existsSync(resolve(path, "node_modules"))) return { installed: "cached", ms: 0 };
  const usePnpm = existsSync(resolve(path, "pnpm-lock.yaml"));
  const argv = usePnpm
    ? ["corepack", "pnpm", "install", "--ignore-scripts", "--no-frozen-lockfile"]
    : ["npm", "install", "--ignore-scripts", "--no-audit", "--no-fund"];
  const result = await run(argv, path, SETUP_TIMEOUT_MS, { COREPACK_ENABLE_DOWNLOAD_PROMPT: "0" });
  if (result.code !== 0) throw new Error(`${repoName} install failed: ${(result.err || result.out).slice(-400)}`);
  return { installed: usePnpm ? "pnpm" : "npm", ms: Date.now() - started };
}

// Inject the fix commit's test files into a worktree. This is what makes the
// base version fail: the test exists only in the fix.
async function injectTests(repoName, fixCommit, testFiles, workspace) {
  const bare = resolve(cache, "repos", repoName, ".git");
  for (const file of testFiles) {
    const blob = await run(["git", "-C", bare, "show", `${fixCommit}:${file}`], root);
    if (blob.code !== 0) continue;
    const target = resolve(workspace, file);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, blob.out);
  }
}

async function runTests(workspace, candidate) {
  const files = candidate.test_files;
  if (candidate.language === "python") {
    return run(["python3", "-m", "pytest", "-x", "-q", ...files], workspace, EVAL_TIMEOUT_MS, {
      PYTHONPATH: workspace,
      PYTHONDONTWRITEBYTECODE: "1"
    });
  }
  if (candidate.runner === "vitest") {
    return run(["npx", "--no-install", "vitest", "run", ...files], workspace, EVAL_TIMEOUT_MS, { CI: "1" });
  }
  return run(["npx", "--no-install", "tap", "--disable-coverage", "--allow-empty-coverage", ...files], workspace, EVAL_TIMEOUT_MS, { CI: "1" });
}

const pool = JSON.parse(await readFile(resolve(root, "tasks/gate-h-heldout/candidate-pool.json"), "utf8"));
const onlyArg = process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1].split(",") : null;
const limit = process.argv.includes("--limit") ? Number(process.argv[process.argv.indexOf("--limit") + 1]) : Infinity;

let examined = 0;
const results = [];

for (const candidate of pool.candidates) {
  if (onlyArg && !onlyArg.includes(candidate.candidate_id)) continue;
  if (examined >= limit) break;
  examined += 1;

  const record = { candidate_id: candidate.candidate_id, language: candidate.language, repository: candidate.repository };
  try {
    const setupStart = Date.now();
    const basePath = await worktree(candidate.repository_name, candidate.base_commit, "base");
    const fixPath = await worktree(candidate.repository_name, candidate.fix_commit, "fixed");
    const install = await installDeps(basePath, candidate.language, candidate.repository_name);
    await installDeps(fixPath, candidate.language, candidate.repository_name);
    record.setup_ms = Date.now() - setupStart;
    record.dependency_install = install.installed;

    await injectTests(candidate.repository_name, candidate.fix_commit, candidate.test_files, basePath);
    await injectTests(candidate.repository_name, candidate.fix_commit, candidate.test_files, fixPath);

    const baseStart = Date.now();
    const base = await runTests(basePath, candidate);
    record.base_exit = base.code;
    record.base_timed_out = base.timedOut;
    record.evaluator_ms = Date.now() - baseStart;

    const fixed = await runTests(fixPath, candidate);
    record.corrected_exit = fixed.code;
    record.corrected_timed_out = fixed.timedOut;

    if (base.timedOut || fixed.timedOut) {
      record.status = "rejected";
      record.rejection_reason = "evaluator timed out";
    } else if (base.code === 0) {
      record.status = "rejected";
      record.rejection_reason = "base version already passes the regression test";
    } else if (fixed.code !== 0) {
      record.status = "rejected";
      record.rejection_reason = `corrected version does not pass (exit ${fixed.code}); likely an environment or dependency problem rather than a task problem`;
      record.corrected_output_tail = (fixed.err || fixed.out).slice(-500);
    } else if (base.code === -1) {
      record.status = "rejected";
      record.rejection_reason = "test runner could not be executed";
    } else {
      record.status = "accepted_candidate";
      record.note = "base fails, corrected passes";
    }
  } catch (error) {
    record.status = "rejected";
    record.rejection_reason = String(error.message).slice(0, 400);
  }

  results.push(record);
  process.stdout.write(
    `${record.status === "accepted_candidate" ? "PASS" : "REJECT"}  ${record.candidate_id}  base=${record.base_exit ?? "-"} fixed=${record.corrected_exit ?? "-"}  ${record.rejection_reason ?? ""}\n`
  );
}

await writeFile(
  resolve(root, "tasks/gate-h-heldout/validation-results.json"),
  `${JSON.stringify({ schema_version: "1.0", examined, results }, null, 2)}\n`
);
process.stdout.write(`\nexamined ${examined}, accepted ${results.filter((r) => r.status === "accepted_candidate").length}\n`);
