import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { platform, arch } from "node:process";
import { resolve } from "node:path";
import { spawn } from "node:child_process";

const root = resolve(new URL("../..", import.meta.url).pathname);
const compiler = resolve(root, process.env.OML_GATE_M_TYPESCRIPT ?? "oml-gate-m-candidates-0cfH2Y/typescript-5.4.2/package/lib/tsc.js");
const tasks = [
  {
    id: "zod-tuple-default", repo: "zod", base: "ec979ad783a9e9c992d3c9bd4e5f3b56110b1ef8", fixed: "b6066b3e4730fc8b966d13974b4abae8dce25df4",
    baseWorkspace: "zod-tuple-base", fixedWorkspace: "zod-tuple-fixed", expectedBaseExit: 17,
    evaluator: "tasks/gate-m/zod-tuple-default/control/evaluator/verify.mjs", license: ".gate-m-cache/worktrees/zod-tuple-base/LICENSE"
  },
  {
    id: "zod-absent-catch", repo: "zod", base: "b8dffe9e62f17e6571e6249d05cc5102b54d94e4", fixed: "1cab69383fcdeae2a366d5e2a2fc4d8fc765d168",
    baseWorkspace: "zod-catch-base", fixedWorkspace: "zod-catch-fixed", expectedBaseExit: 17,
    evaluator: "tasks/gate-m/zod-absent-catch/control/evaluator/verify.mjs", license: ".gate-m-cache/worktrees/zod-catch-base/LICENSE"
  },
  {
    id: "date-fns-zh-month", repo: "date-fns", base: "39d1e14200cead9e4be5df88695b5e82082875ed", fixed: "b9c5865edb7610c59e6b3694ed1e1691f4807688",
    baseWorkspace: "date-fns-base", fixedWorkspace: "date-fns-fixed", expectedBaseExit: 17,
    evaluator: "tasks/gate-m/date-fns-zh-month/control/evaluator/verify.mjs", license: ".gate-m-cache/worktrees/date-fns-base/pkgs/core/LICENSE.md"
  },
  {
    id: "type-fest-conditional-keys", repo: "type-fest", base: "b6d8dd60726a8d7df5a5eea3b3c9d830804d2570", fixed: "0fb2d62f7d222d3effb0ad89d5b340e36285bcc4",
    baseWorkspace: "type-fest-base", fixedWorkspace: "type-fest-fixed", expectedBaseExit: 2,
    evaluator: "tasks/gate-m/type-fest-conditional-keys/control/evaluator/verify.mjs", license: ".gate-m-cache/worktrees/type-fest-base/license-mit", compiler
  }
];

const records = [];
for (const task of tasks) {
  const bare = resolve(root, `.gate-m-cache/repos/${task.repo}/.git`);
  const baseWorkspace = resolve(root, `.gate-m-cache/worktrees/${task.baseWorkspace}`);
  const fixedWorkspace = resolve(root, `.gate-m-cache/worktrees/${task.fixedWorkspace}`);
  const evaluator = resolve(root, task.evaluator);
  const baseHead = await textProcess(["git", "-C", baseWorkspace, "rev-parse", "HEAD"], root);
  const fixedHead = await textProcess(["git", "-C", fixedWorkspace, "rev-parse", "HEAD"], root);
  if (baseHead.stdout.toString("utf8").trim() !== task.base || fixedHead.stdout.toString("utf8").trim() !== task.fixed) {
    throw new Error(`${task.id}: stale worktree commit`);
  }
  const baseArchiveSha256 = await archiveHash(bare, task.base);
  const fixedArchiveSha256 = await archiveHash(bare, task.fixed);
  const evaluatorSha256 = sha256(await readFile(evaluator));
  const licenseSha256 = sha256(await readFile(resolve(root, task.license)));
  const extra = task.compiler ? [task.compiler] : [];
  const baseResult = await textProcess([process.execPath, evaluator, baseWorkspace, ...extra], root);
  const fixedResult = await textProcess([process.execPath, evaluator, fixedWorkspace, ...extra], root);
  const accepted = baseResult.exit_code === task.expectedBaseExit && fixedResult.exit_code === 0;
  records.push({
    task_id: task.id,
    accepted,
    base: { commit: task.base, archive_sha256: baseArchiveSha256, ...evidence(baseResult) },
    corrected: { commit: task.fixed, archive_sha256: fixedArchiveSha256, ...evidence(fixedResult) },
    evaluator: { path: task.evaluator, sha256: evaluatorSha256 },
    license_sha256: licenseSha256,
    compiler: task.compiler ? { path_argument_required: true, version: "5.4.2" } : null
  });
}

process.stdout.write(`${JSON.stringify({
  schema_version: "0.1",
  purpose: "gate_m_real_task_mechanics_only",
  capability_claim_permitted: false,
  observed_at: new Date().toISOString(),
  environment: { platform, architecture: arch, node_version: process.version },
  records
}, null, 2)}\n`);

function evidence(result) {
  return {
    exit_code: result.exit_code,
    duration_ms: result.duration_ms,
    stdout_sha256: sha256(result.stdout),
    stderr_sha256: sha256(result.stderr),
    stdout: result.stdout.toString("utf8"),
    stderr: result.stderr.toString("utf8")
  };
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function archiveHash(gitDir, commit) {
  const result = await binaryProcess(["git", `--git-dir=${gitDir}`, "archive", commit], root);
  if (result.exit_code !== 0) throw new Error(`git archive failed for ${commit}: ${result.stderr.toString("utf8")}`);
  return sha256(result.stdout);
}

async function textProcess(argv, cwd) {
  return binaryProcess(argv, cwd);
}

async function binaryProcess(argv, cwd) {
  const started = performance.now();
  const [command, ...args] = argv;
  return await new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd, env: { PATH: process.env.PATH }, shell: false, stdio: ["ignore", "pipe", "pipe"] });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.once("error", reject);
    child.once("close", (exitCode) => resolvePromise({
      exit_code: exitCode,
      duration_ms: Math.round(performance.now() - started),
      stdout: Buffer.concat(stdout),
      stderr: Buffer.concat(stderr)
    }));
  });
}
