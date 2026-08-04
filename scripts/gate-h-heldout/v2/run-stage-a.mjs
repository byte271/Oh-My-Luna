// Stage A runner for the held-out Gate H corpus — protocol v2.
//
// v1's runner is pinned by the v1 freeze and is left untouched, so the record
// of what was frozen on 2026-08-02 stays reproducible at its recorded commit.
// This is the corrected implementation, and it is DRY-RUN ONLY: protocol v2 is
// a candidate, not a freeze, and two decisions in
// `docs/gate-h-heldout-v2-plan.md` (§5 skill-control arm, §8 outcome-measure
// validity) are the owner's and remain open. Running live against an unfrozen
// protocol is the same failure as changing a protocol after seeing results.
//
// What is corrected relative to v1:
//
//   §1  Every arm, T0 included, receives the complete source of each permitted
//       path at the base commit. v1 demanded complete file contents and shipped
//       none, under `tools: []`.
//   §2  Four sufficiency gates run before anything else and refuse the run.
//   §3b Returned files are diffed against the base commit and the metrics are
//       recorded per attempt — diagnostic only, never entering success.
//   §6  Repository root resolved with fileURLToPath, so a path containing a
//       space (Linux) or a drive letter (Windows) does not silently break.
//   §8  A timeout is a distinct evaluator outcome from a test failure.
//
//   Plus: prompt substitution that cannot be corrupted by `$&` in source;
//   change-set validation that fails closed on an empty permitted set, rejects
//   duplicate paths, and refuses writes that escape through a symlink;
//   a budget estimate that does not under-reserve on multi-byte text; and
//   unprivileged stubs that receive the prompt and nothing else.
//
// Usage:
//   node scripts/gate-h-heldout/v2/run-stage-a.mjs --dry-run oracle
//   node scripts/gate-h-heldout/v2/run-stage-a.mjs --dry-run noop
//   node scripts/gate-h-heldout/v2/run-stage-a.mjs --dry-run prose
//   node scripts/gate-h-heldout/v2/run-stage-a.mjs --dry-run unseen
//   node scripts/gate-h-heldout/v2/run-stage-a.mjs --dry-run mixed

import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

import { buildTaskPrompt, renderAssistance } from "../../../dist/src/heldout/prompt.js";
import { assertContainedTarget, validateChangeSet } from "../../../dist/src/heldout/changeset.js";
import { diffReturnedFile, summarizeAttemptDiff } from "../../../dist/src/heldout/diff.js";
import { interpretEvaluatorExit } from "../../../dist/src/heldout/outcome.js";
import { UNPRIVILEGED_STUBS } from "../../../dist/src/heldout/stubs.js";
import { estimateTokensConservative } from "../../../dist/src/heldout/tokens.js";
import { estimateRequestCost } from "../../../dist/src/providers/openai-cost.js";
import { BudgetGuard } from "../../../dist/src/providers/budget.js";

const root = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const base = resolve(root, "tasks/gate-h-heldout");
const cache = resolve(root, ".gate-h-heldout-cache");

const dryRunIndex = process.argv.indexOf("--dry-run");
const DRY_RUN = dryRunIndex > -1;
const STUB = DRY_RUN ? process.argv[dryRunIndex + 1] : null;
const limitIndex = process.argv.indexOf("--limit");
const LIMIT = limitIndex > -1 ? Number(process.argv[limitIndex + 1]) : Infinity;

const sha256 = (v) => createHash("sha256").update(v).digest("hex");

if (!DRY_RUN) {
  process.stderr.write(
    "protocol v2 is a candidate, not a freeze. Live execution is refused.\n\n" +
      "Two decisions in docs/gate-h-heldout-v2-plan.md are open and are the owner's:\n" +
      "  §5 whether to include the skill-control arm\n" +
      "  §8 whether evaluator_exit === 0 is an adequate outcome measure\n\n" +
      "Both must be settled before a v2 freeze, because deciding either after\n" +
      "results exist converts the experiment into a search.\n\n" +
      "To prove the orchestration without spending:\n" +
      "  node scripts/gate-h-heldout/v2/run-stage-a.mjs --dry-run oracle\n"
  );
  process.exit(21);
}

function run(argv, cwd, env, timeoutMs = 300_000) {
  return new Promise((res) => {
    const child = spawn(argv[0], argv.slice(1), {
      cwd,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      env: env ?? { ...process.env }
    });
    let out = "";
    let err = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);
    child.stdout.on("data", (c) => (out += c));
    child.stderr.on("data", (c) => (err += c));
    child.on("error", () => {
      clearTimeout(timer);
      res({ code: -1, signal: null, timedOut, out, err });
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      res({ code, signal, timedOut, out, err });
    });
  });
}

// --- sufficiency gate -------------------------------------------------------
// Runs before anything else and refuses. This is the gate whose absence let a
// 20/20 dry run coexist with a protocol no model could satisfy.
const sufficiency = await run(
  [process.execPath, "scripts/gate-h-heldout/check-sufficiency.mjs", "--protocol", "v2"],
  root,
  { ...process.env }
);
if (sufficiency.code !== 0) {
  process.stderr.write(`refusing to run: the v2 protocol fails its sufficiency gates.\n${sufficiency.out}${sufficiency.err}`);
  process.exit(31);
}

// --- v1 freeze gate ---------------------------------------------------------
// The corpus, evaluators and packets still come from the v1 freeze, so their
// integrity still has to hold even though the protocol has moved on.
const freezeCheck = await run([process.execPath, "scripts/gate-h-heldout/freeze.mjs", "--verify"], root, { ...process.env });
if (freezeCheck.code !== 0) {
  process.stderr.write(`refusing to run: the corpus freeze does not verify.\n${freezeCheck.out}${freezeCheck.err}`);
  process.exit(30);
}

const freeze = JSON.parse(await readFile(resolve(base, "freeze", "identity.json"), "utf8"));
const candidate = JSON.parse(await readFile(resolve(root, "tasks/gate-h-heldout-v2/protocol.candidate.json"), "utf8"));
const settings = candidate.model_settings_proposed;
const pricing = JSON.parse(await readFile(resolve(root, "data/pricing/openai-2026-08-02.evidence.json"), "utf8"));

const guard = new BudgetGuard({
  max_requests: freeze.schedule.stage_a_attempts,
  max_total_usd: Number.MAX_SAFE_INTEGER,
  max_request_usd: Number.MAX_SAFE_INTEGER
});

const repoName = (task) => task.repository.split("/").pop();
const gitDir = (task) => resolve(cache, "repos", repoName(task), ".git");

async function gitShow(task, commit, path) {
  const result = await run(["git", "-C", gitDir(task), "show", `${commit}:${path}`], root, { ...process.env });
  if (result.code !== 0) throw new Error(`git show ${commit}:${path} failed for ${task.task_id}`);
  return result.out;
}

// --- prompt assembly --------------------------------------------------------
async function buildPrompt(task, control, arm, sources) {
  const issue = await readFile(resolve(base, "tasks", task.task_id, "visible", "issue.md"), "utf8");
  let assistance = "";
  if (arm !== "T0") {
    const packet = JSON.parse(await readFile(resolve(base, "tasks", task.task_id, "arms", `${arm}.json`), "utf8"));
    assistance = renderAssistance(packet.payload);
  }
  return buildTaskPrompt(candidate.prompts.task_prompt_template, { issue, sources, assistance });
}

/** Regions the arm cited, used only to describe where a failing edit landed. */
async function citedRegions(task, arm, path) {
  if (arm === "T0") return [];
  const packet = JSON.parse(await readFile(resolve(base, "tasks", task.task_id, "arms", `${arm}.json`), "utf8"));
  const regions = packet.payload?.context?.regions ?? [];
  return regions
    .filter((r) => r.path === path)
    .map((r) => ({ start_line: r.start_line, end_line: r.end_line }));
}

// --- stubs ------------------------------------------------------------------
// Unprivileged stubs receive the assembled prompt and nothing else, so none can
// be better informed than the model it stands in for. `oracle` is the one
// declared exception: it must hold the corrected file to prove the
// apply-and-evaluate path works at all, and its passes are never evidence that
// the prompt is sufficient.
async function stubOutput(kind, task, control, arm, prompt) {
  if (kind === "mixed") {
    return stubOutput(arm === "T0" ? "noop" : "oracle", task, control, arm, prompt);
  }
  const unprivileged = UNPRIVILEGED_STUBS[kind];
  if (unprivileged !== undefined) {
    return unprivileged({ prompt, permittedPaths: control.permitted_paths });
  }
  if (kind === "oracle") {
    const files = [];
    for (const path of control.permitted_paths) {
      files.push({ path, contents: await gitShow(task, task.corrected_commit, path) });
    }
    return JSON.stringify({ files });
  }
  throw new Error(`unknown stub: ${kind}`);
}

// --- workspace --------------------------------------------------------------
async function materialize(task, scratch) {
  const src = resolve(cache, "worktrees", `${repoName(task)}-base-${task.base_commit.slice(0, 8)}`);
  if (!existsSync(src)) {
    throw new Error(`base worktree missing for ${task.task_id}; run: npm run heldout:provision`);
  }
  const head = (await run(["git", "-C", src, "rev-parse", "HEAD"], root, { ...process.env })).out.trim();
  if (head !== task.base_commit) {
    throw new Error(`base worktree for ${task.task_id} is at ${head}, expected ${task.base_commit}`);
  }
  // Fail closed on a dirty base worktree: candidate validation injects the
  // corrected regression test into worktrees, and a copied dirty tree would
  // hand the model the very test that judges it.
  const dirty = (await run(["git", "-C", src, "status", "--porcelain"], root, { ...process.env })).out.trim();
  if (dirty !== "") {
    throw new Error(`base worktree for ${task.task_id} is dirty:\n${dirty.slice(0, 400)}`);
  }
  const dest = resolve(scratch, "workspace");
  await cp(src, dest, {
    recursive: true,
    filter: (p) => !p.includes(`${src}/node_modules`) && !p.includes(`${src}/.git`)
  });
  if (existsSync(resolve(src, "node_modules"))) {
    // Shared, deliberately: a per-attempt install costs minutes. It is also why
    // every write target is checked for containment before it is written.
    await symlink(resolve(src, "node_modules"), resolve(dest, "node_modules"), "dir");
  }
  return dest;
}

// --- run --------------------------------------------------------------------
const runId = `stage-a-v2-dryrun-${STUB}-${Date.now()}`;
const outDir = resolve(root, ".oml-runs", runId);
await mkdir(outDir, { recursive: true });

const tasksById = new Map(freeze.corpus.tasks.map((t) => [t.task_id, t]));
const attempts = [];
let executed = 0;

for (const cell of freeze.schedule.order) {
  if (executed >= LIMIT) break;
  executed += 1;
  const task = tasksById.get(cell.task_id);
  const control = JSON.parse(await readFile(resolve(base, "tasks", cell.task_id, "control", "evaluator.json"), "utf8"));

  const sources = [];
  for (const path of control.permitted_paths) {
    sources.push({ path, contents: await gitShow(task, task.base_commit, path) });
  }
  const baseByPath = new Map(sources.map((s) => [s.path, s.contents]));
  const prompt = await buildPrompt(task, control, cell.treatment_id, sources);

  const attempt = {
    sequence: cell.sequence,
    task_id: cell.task_id,
    treatment_id: cell.treatment_id,
    protocol_version: candidate.protocol_version,
    protocol_frozen: false,
    mode: `dry_run_stub_${STUB}`,
    capability_evidence: false,
    prompt_sha256: sha256(prompt),
    prompt_tokens_conservative: estimateTokensConservative(prompt),
    system_prompt_sha256: sha256(candidate.prompts.system_prompt),
    corpus_freeze_id: freeze.freeze_id
  };

  // Reserved against a deliberately pessimistic token estimate. v1 reserved on
  // `prompt.length / 3`, a character count that under-reserves for any
  // multi-byte script.
  const estimate = estimateRequestCost(
    attempt.prompt_tokens_conservative,
    settings.max_output_tokens,
    pricing,
    settings.model_alias
  );
  attempt.pessimistic_cost_usd = estimate;
  guard.reserve(0);

  const scratch = await mkdtemp(resolve(tmpdir(), "oml-stagea-v2-"));
  try {
    const outputText = await stubOutput(STUB, task, control, cell.treatment_id, prompt);
    attempt.provider = { stub: STUB, note: "no provider was contacted; this is not a model result" };

    const verdict = validateChangeSet(outputText, {
      status: "completed",
      incompleteReason: null,
      maxBytes: 2_000_000,
      permittedPaths: control.permitted_paths
    });

    if (!verdict.ok) {
      attempt.status = "output_rejected";
      attempt.output_rejection = verdict.reason;
      attempt.output_rejection_detail = verdict.detail;
      attempt.task_success = false;
      attempts.push(attempt);
      process.stdout.write(`${cell.sequence}. ${cell.task_id} ${cell.treatment_id}: FAIL (${verdict.reason})\n`);
      continue;
    }

    const workspace = await materialize(task, scratch);

    // Diagnostic diff, computed before the write so the base is unambiguous.
    // It never enters the success criterion.
    const fileDiffs = [];
    for (const file of verdict.files) {
      const baseContents = baseByPath.get(file.path);
      if (baseContents === undefined) continue;
      fileDiffs.push(
        diffReturnedFile(file.path, baseContents, file.contents, {
          citedRegions: await citedRegions(task, cell.treatment_id, file.path)
        })
      );
    }

    for (const file of verdict.files) {
      // Refuses a write that escapes the disposable workspace through the
      // shared node_modules link before it can contaminate a later attempt.
      const target = await assertContainedTarget(workspace, file.path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, file.contents);
    }
    attempt.files_changed = verdict.files.map((f) => f.path);
    attempt.unnecessary_files_changed = verdict.files.filter((f) => !control.permitted_paths.includes(f.path)).length;

    const evalStart = Date.now();
    const evaluation = await run(
      [process.execPath, "scripts/gate-h-heldout/v2/evaluate.mjs", cell.task_id, workspace],
      root,
      // No credential and no treatment identity reaches the evaluator.
      { PATH: process.env.PATH, HOME: process.env.HOME }
    );
    const outcome = interpretEvaluatorExit(evaluation.code);

    attempt.evaluator_exit = evaluation.code;
    attempt.evaluator_outcome = outcome.outcome;
    attempt.evaluator_attributable_to_model = outcome.attributable_to_model;
    attempt.evaluator_ms = Date.now() - evalStart;
    attempt.evaluator_receipt = (evaluation.err || "").trim().split("\n").pop() ?? null;
    attempt.task_success = evaluation.code === 0;
    attempt.status = "evaluated";
    attempt.false_completion = !attempt.task_success && verdict.files.length > 0;
    attempt.diff = summarizeAttemptDiff(fileDiffs, { taskSucceeded: attempt.task_success });

    attempts.push(attempt);
    process.stdout.write(
      `${cell.sequence}. ${cell.task_id} ${cell.treatment_id}: ${attempt.task_success ? "PASS" : "FAIL"} ` +
        `(${outcome.outcome}, exit ${evaluation.code}, ${attempt.diff.total_hunks} hunks)\n`
    );
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

// --- summary ----------------------------------------------------------------
const byTask = {};
for (const a of attempts) {
  byTask[a.task_id] ??= {};
  byTask[a.task_id][a.treatment_id] = a.task_success === true;
}
const t0Failures = Object.entries(byTask)
  .filter(([, arms]) => arms.T0 === false)
  .map(([t]) => t);
const continuation = {};
for (const arm of ["T1", "T2", "T3"]) {
  continuation[arm] = t0Failures.filter((t) => byTask[t]?.[arm] === true).length;
}
const rulePassed = Object.values(continuation).some((n) => n >= 2);

// Attempts whose failure the harness caused are counted apart from attempts the
// model failed. v1 could not make this distinction at all.
const nonAttributable = attempts.filter((a) => a.evaluator_attributable_to_model === false).length;

const summary = {
  schema_version: "1.0",
  run_id: runId,
  protocol_version: candidate.protocol_version,
  protocol_frozen: false,
  corpus_freeze_id: freeze.freeze_id,
  mode: `dry_run_stub_${STUB}`,
  capability_evidence: false,
  capability_note:
    "Dry run with a deterministic stub against an unfrozen candidate protocol. No provider was contacted. This validates orchestration only and is not a model result.",
  attempts_executed: attempts.length,
  spent_usd: 0,
  pessimistic_cost_if_live_usd: attempts.reduce((n, a) => n + (a.pessimistic_cost_usd ?? 0), 0),
  per_task_per_arm: byTask,
  t0_failing_tasks: t0Failures,
  assisted_wins_where_t0_failed: continuation,
  continuation_rule: freeze.analysis_plan.continuation_rule,
  continuation_rule_passed: rulePassed,
  attempts_not_attributable_to_model: nonAttributable,
  verdict: rulePassed ? "continue_to_stage_b" : "no_detectable_large_signal_on_this_exploratory_corpus",
  attempts
};

await writeFile(resolve(outDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
process.stdout.write(`\nattempts: ${attempts.length}  spent: $0.0000  (pessimistic if live: $${summary.pessimistic_cost_if_live_usd.toFixed(4)})\n`);
process.stdout.write(`not attributable to the model: ${nonAttributable}\n`);
process.stdout.write(`continuation rule passed: ${rulePassed}\nverdict: ${summary.verdict}\n`);
process.stdout.write(`receipts: ${outDir}/summary.json\n`);
process.stdout.write("\nDRY RUN — no provider contacted, no model result, no capability evidence.\n");
