// Stage A runner for the held-out Gate H corpus.
//
// Executes the frozen schedule: one attempt per task per arm, in the frozen
// order, under the frozen prompts and model settings, with a session budget
// guard. Every attempt produces a receipt whether it succeeds or fails.
//
// Two modes:
//
//   --dry-run <stub>   no provider, no money. Substitutes a deterministic stub
//                      for the model so the orchestration can be proven end to
//                      end. Stub output is NOT a model result and is recorded
//                      as capability_evidence: false.
//
//   (default)          live. Requires OPENAI_API_KEY, OML_LIVE_APPROVED=1 and
//                      OML_LIVE_BUDGET_USD together, and refuses otherwise.
//
// The freeze is verified before anything runs. A mutated freeze aborts the run
// rather than silently producing results against changed inputs.
//
// Usage:
//   node scripts/gate-h-heldout/run-stage-a.mjs --dry-run oracle
//   node scripts/gate-h-heldout/run-stage-a.mjs --dry-run prose
//   node scripts/gate-h-heldout/run-stage-a.mjs            (live)

import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { spawn } from "node:child_process";
import { checkLiveAuthorization, formatPreflight } from "../../dist/src/providers/live-gate.js";
import { BudgetGuard } from "../../dist/src/providers/budget.js";
import { computeTokenCost, estimateRequestCost } from "../../dist/src/providers/openai-cost.js";
import { SDK_VERSION, callResponses, createClient, newClientRequestId, LiveTransportError } from "../../dist/src/providers/openai-transport.js";
import { validateProviderOutput } from "../../dist/src/providers/output-validation.js";

const root = resolve(new URL("../..", import.meta.url).pathname);
const base = resolve(root, "tasks/gate-h-heldout");
const cache = resolve(root, ".gate-h-heldout-cache");

const dryRunIndex = process.argv.indexOf("--dry-run");
const DRY_RUN = dryRunIndex > -1;
const STUB = DRY_RUN ? process.argv[dryRunIndex + 1] : null;
const limitIndex = process.argv.indexOf("--limit");
const LIMIT = limitIndex > -1 ? Number(process.argv[limitIndex + 1]) : Infinity;

const sha256 = (v) => createHash("sha256").update(v).digest("hex");

function run(argv, cwd, env = {}, timeoutMs = 300_000) {
  return new Promise((res) => {
    const child = spawn(argv[0], argv.slice(1), { cwd, shell: false, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, ...env } });
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

// --- freeze gate ------------------------------------------------------------
const verify = await run([process.execPath, "scripts/gate-h-heldout/freeze.mjs", "--verify"], root);
if (verify.code !== 0) {
  process.stderr.write(`refusing to run: the freeze does not verify.\n${verify.out}`);
  process.exit(30);
}
const freeze = JSON.parse(await readFile(resolve(base, "freeze", "identity.json"), "utf8"));
const settings = freeze.model_settings;
const pricing = JSON.parse(await readFile(resolve(root, "data/pricing/openai-2026-08-02.evidence.json"), "utf8"));

// --- authorization ----------------------------------------------------------
let auth = null;
if (!DRY_RUN) {
  const check = checkLiveAuthorization();
  if (!check.authorized) {
    process.stderr.write(
      `Stage A not run: ${check.detail}\nreason: ${check.reason}\n\n` +
        "All three are required and none may be committed:\n  OPENAI_API_KEY=<key>\n  OML_LIVE_APPROVED=1\n  OML_LIVE_BUDGET_USD=<positive limit>\n\n" +
        "To prove the orchestration without spending:\n  node scripts/gate-h-heldout/run-stage-a.mjs --dry-run oracle\n"
    );
    process.exit(20);
  }
  auth = check.authorization;
}

const sessionCap = DRY_RUN ? Number.MAX_SAFE_INTEGER : Math.min(auth.budgetUsd, settings.session_cap_usd);
const guard = new BudgetGuard({
  max_requests: freeze.schedule.stage_a_attempts,
  max_total_usd: sessionCap,
  max_request_usd: DRY_RUN ? Number.MAX_SAFE_INTEGER : settings.per_request_cap_usd
});

// --- stubs ------------------------------------------------------------------
// Deterministic substitutes for the model, used only to prove the pipeline.
// None of these is a model result.
async function stubOutput(kind, task, control, arm) {
  if (kind === "mixed") {
    // Exercises the continuation rule's positive branch: T0 leaves the base
    // untouched (fails) while assisted arms apply the correction (pass). Without
    // this, "continue_to_stage_b" would never be executed before real data.
    return stubOutput(arm === "T0" ? "noop" : "oracle", task, control, arm);
  }
  if (kind === "prose") {
    return "I have reviewed the code and fixed the defect. All tests should now pass.";
  }
  if (kind === "noop") {
    const files = [];
    for (const path of control.permitted_paths) {
      const blob = await run(["git", "-C", resolve(cache, "repos", repoName(task), ".git"), "show", `${task.base_commit}:${path}`], root);
      files.push({ path, contents: blob.out });
    }
    return JSON.stringify({ files });
  }
  if (kind === "oracle") {
    // The corrected file contents. This proves the apply-and-evaluate path
    // works; it says nothing whatever about model capability.
    const files = [];
    for (const path of control.permitted_paths) {
      const blob = await run(["git", "-C", resolve(cache, "repos", repoName(task), ".git"), "show", `${task.corrected_commit}:${path}`], root);
      files.push({ path, contents: blob.out });
    }
    return JSON.stringify({ files });
  }
  throw new Error(`unknown stub: ${kind}`);
}

const repoName = (task) => task.repository.split("/").pop();

// --- prompt assembly --------------------------------------------------------
async function buildPrompt(task, arm) {
  const issue = await readFile(resolve(base, "tasks", task.task_id, "visible", "issue.md"), "utf8");
  let assistance = "";
  if (arm !== "T0") {
    const packet = JSON.parse(await readFile(resolve(base, "tasks", task.task_id, "arms", `${arm}.json`), "utf8"));
    assistance = `\n<assistance>\n${JSON.stringify(packet.payload, null, 2)}\n</assistance>\n`;
  }
  return freeze.prompts.task_prompt_template.replace("{{ISSUE}}", issue.trim()).replace("{{ASSISTANCE}}", assistance);
}

// --- workspace --------------------------------------------------------------
async function materialize(task, scratch) {
  const src = resolve(cache, "worktrees", `${repoName(task)}-base-${task.base_commit.slice(0, 8)}`);
  if (!existsSync(src)) {
    throw new Error(`base worktree missing for ${task.task_id}; run: npm run heldout:provision`);
  }

  // Fail closed on a dirty base worktree. Candidate validation injects the
  // corrected regression test into worktrees; if such a tree were copied here,
  // the model would be handed the very test that judges it. Cleanliness is
  // asserted per attempt rather than assumed from provisioning having been run.
  const head = (await run(["git", "-C", src, "rev-parse", "HEAD"], root)).out.trim();
  if (head !== task.base_commit) {
    throw new Error(`base worktree for ${task.task_id} is at ${head}, expected ${task.base_commit}; run: npm run heldout:provision`);
  }
  const dirty = (await run(["git", "-C", src, "status", "--porcelain"], root)).out.trim();
  if (dirty !== "") {
    throw new Error(
      `base worktree for ${task.task_id} is dirty, so it may contain evaluator-only material:\n${dirty.slice(0, 400)}\nrun: npm run heldout:provision`
    );
  }
  const dest = resolve(scratch, "workspace");
  // Copy source but reuse the installed dependency tree by link, so each
  // attempt gets a clean tree without a multi-minute install.
  await cp(src, dest, {
    recursive: true,
    filter: (p) => !p.includes(`${src}/node_modules`) && !p.includes(`${src}/.git`)
  });
  if (existsSync(resolve(src, "node_modules"))) {
    await symlink(resolve(src, "node_modules"), resolve(dest, "node_modules"), "dir");
  }
  return dest;
}

// --- run --------------------------------------------------------------------
const runId = `stage-a-${DRY_RUN ? `dryrun-${STUB}` : "live"}-${Date.now()}`;
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
  const prompt = await buildPrompt(task, cell.treatment_id);

  const attempt = {
    sequence: cell.sequence,
    task_id: cell.task_id,
    treatment_id: cell.treatment_id,
    mode: DRY_RUN ? `dry_run_stub_${STUB}` : "live",
    capability_evidence: false,
    prompt_sha256: sha256(prompt),
    system_prompt_sha256: freeze.prompts.system_prompt_sha256,
    freeze_id: freeze.freeze_id
  };

  const estimate = estimateRequestCost(Math.ceil(prompt.length / 3), settings.max_output_tokens, pricing, settings.model_alias);
  try {
    guard.reserve(DRY_RUN ? 0 : estimate);
  } catch (error) {
    attempt.status = "budget_refused";
    attempt.error = error.message;
    attempts.push(attempt);
    process.stdout.write(`${cell.sequence}. ${cell.task_id} ${cell.treatment_id}: BUDGET REFUSED\n`);
    break;
  }

  if (!DRY_RUN) {
    process.stderr.write(
      `${formatPreflight({
        requested_model: settings.model_alias,
        task_id: cell.task_id,
        treatment: cell.treatment_id,
        max_output_tokens: settings.max_output_tokens,
        reasoning_effort: settings.reasoning_effort,
        pessimistic_max_cost_usd: estimate,
        remaining_budget_usd: sessionCap - guard.state.spent_usd,
        documentation_evidence_id: settings.documentation_evidence_id,
        sdk_version: SDK_VERSION
      })}\n\n`
    );
  }

  const scratch = await mkdtemp(resolve(tmpdir(), "oml-stagea-"));
  try {
    let outputText;
    if (DRY_RUN) {
      outputText = await stubOutput(STUB, task, control, cell.treatment_id);
      attempt.provider = { stub: STUB, note: "no provider was contacted; this is not a model result" };
    } else {
      const clientRequestId = newClientRequestId();
      try {
        const result = await callResponses(
          createClient(auth.apiKey, settings.timeout_ms),
          {
            model: settings.model_alias,
            input: prompt,
            instructions: freeze.prompts.system_prompt,
            maxOutputTokens: settings.max_output_tokens,
            reasoningEffort: settings.reasoning_effort,
            timeoutMs: settings.timeout_ms,
            clientRequestId
          },
          auth.apiKey
        );
        const cacheWriteReported = result.cache_write_tokens !== null;
        const cost = computeTokenCost(
          {
            input_tokens: result.input_tokens ?? 0,
            cached_input_tokens: result.cached_input_tokens ?? 0,
            cache_write_tokens: result.cache_write_tokens ?? 0,
            output_tokens: result.output_tokens ?? 0
          },
          pricing,
          settings.model_alias,
          { cacheWriteReported }
        );
        guard.settle(estimate, cost.token_cost_usd);
        outputText = result.output_text;
        attempt.provider = {
          provider_response_id: result.provider_response_id,
          server_request_id: result.server_request_id,
          client_request_id: result.client_request_id,
          requested_model: result.requested_model,
          returned_model: result.returned_model,
          status: result.status,
          incomplete_reason: result.incomplete_reason,
          usage: {
            input_tokens: result.input_tokens,
            cached_input_tokens: result.cached_input_tokens,
            cache_write_tokens: result.cache_write_tokens,
            output_tokens: result.output_tokens,
            reasoning_tokens: result.reasoning_tokens,
            total_tokens: result.total_tokens
          },
          service_tier: result.service_tier,
          duration_ms: result.duration_ms,
          cost_usd: cost.token_cost_usd,
          cost_accuracy: cost.accuracy
        };
      } catch (error) {
        if (!(error instanceof LiveTransportError)) throw error;
        guard.settle(estimate, 0);
        attempt.status = "provider_error";
        attempt.provider = {
          outcome: error.failure.outcome,
          billing_status: error.failure.billing_status,
          error_class: error.failure.error_class,
          client_request_id: error.failure.client_request_id,
          server_request_id: error.failure.server_request_id,
          retryable: error.failure.retryable
        };
        attempt.task_success = false;
        attempts.push(attempt);
        process.stdout.write(`${cell.sequence}. ${cell.task_id} ${cell.treatment_id}: PROVIDER ERROR ${error.failure.error_class}\n`);
        // Frozen policy: attempts are not retried.
        continue;
      }
    }

    const verdict = validateProviderOutput(outputText, {
      status: DRY_RUN ? "completed" : attempt.provider.status,
      incompleteReason: DRY_RUN ? null : attempt.provider.incomplete_reason,
      maxBytes: 2_000_000,
      permittedPaths: control.permitted_paths
    });

    if (!verdict.ok) {
      attempt.status = "output_rejected";
      attempt.output_rejection = verdict.reason;
      attempt.task_success = false;
      attempts.push(attempt);
      process.stdout.write(`${cell.sequence}. ${cell.task_id} ${cell.treatment_id}: FAIL (${verdict.reason})\n`);
      continue;
    }

    const workspace = await materialize(task, scratch);
    for (const file of verdict.files) {
      const target = resolve(workspace, file.path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, file.contents);
    }
    attempt.files_changed = verdict.files.map((f) => f.path);
    attempt.unnecessary_files_changed = verdict.files.filter((f) => !control.permitted_paths.includes(f.path)).length;

    const evalStart = Date.now();
    const evaluation = await run([process.execPath, "scripts/gate-h-heldout/evaluate.mjs", cell.task_id, workspace], root);
    attempt.evaluator_exit = evaluation.code;
    attempt.evaluator_ms = Date.now() - evalStart;
    attempt.task_success = evaluation.code === 0;
    attempt.status = "evaluated";
    // A change set that parses but does not fix anything is a plain failure,
    // recorded as such rather than as a partial success.
    attempt.false_completion = !attempt.task_success && verdict.files.length > 0;

    attempts.push(attempt);
    process.stdout.write(
      `${cell.sequence}. ${cell.task_id} ${cell.treatment_id}: ${attempt.task_success ? "PASS" : "FAIL"} (evaluator exit ${evaluation.code})\n`
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
const t0Failures = Object.entries(byTask).filter(([, arms]) => arms.T0 === false).map(([t]) => t);
const continuation = {};
for (const arm of ["T1", "T2", "T3"]) {
  continuation[arm] = t0Failures.filter((t) => byTask[t]?.[arm] === true).length;
}
const rulePassed = Object.values(continuation).some((n) => n >= 2);

const summary = {
  schema_version: "1.0",
  run_id: runId,
  freeze_id: freeze.freeze_id,
  mode: DRY_RUN ? `dry_run_stub_${STUB}` : "live",
  capability_evidence: false,
  capability_note: DRY_RUN
    ? "Dry run with a deterministic stub. No provider was contacted. This validates orchestration only and is not a model result."
    : "Exploratory Stage A on a small held-out corpus. Not a capability claim.",
  attempts_executed: attempts.length,
  spent_usd: DRY_RUN ? 0 : guard.state.spent_usd,
  session_cap_usd: DRY_RUN ? null : sessionCap,
  per_task_per_arm: byTask,
  t0_failing_tasks: t0Failures,
  assisted_wins_where_t0_failed: continuation,
  continuation_rule: freeze.analysis_plan.continuation_rule,
  continuation_rule_passed: rulePassed,
  verdict: rulePassed
    ? "continue_to_stage_b"
    : "no_detectable_large_signal_on_this_exploratory_corpus",
  attempts
};

await writeFile(resolve(outDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
process.stdout.write(`\nattempts: ${attempts.length}  spent: $${summary.spent_usd.toFixed(4)}\n`);
process.stdout.write(`continuation rule passed: ${rulePassed}\nverdict: ${summary.verdict}\n`);
process.stdout.write(`receipts: ${outDir}/summary.json\n`);
if (DRY_RUN) process.stdout.write("\nDRY RUN — no provider contacted, no model result, no capability evidence.\n");
