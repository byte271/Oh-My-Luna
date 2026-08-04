// Freezes the held-out Gate H experiment before any model execution.
//
// Everything a result could depend on is bound here: tasks, commits, source
// hashes, evaluators, permitted paths, T0-T3 material, prompts, model settings,
// budgets, the Stage A schedule, the continuation rule and the analysis plan.
//
// Usage: node scripts/gate-h-heldout/freeze.mjs [--verify] [--seal]
//
// Coverage note, established by experiment on 2026-08-04:
//
//   `aggregate_sha256` covers exactly {freeze_id, artifacts, corpus, prompts,
//   model_settings, schedule}. It does NOT cover analysis_plan,
//   forbidden_claims, arms, leakage_controls, status, live_calls_made or
//   capability_claim_permitted — and identity.json is excluded from the
//   artifact list, so nothing else covered them either.
//
//   Demonstrated by lowering the continuation rule from "at least two tasks" to
//   "at least ONE task", deleting a forbidden claim, and setting
//   live_calls_made to 999. `--verify` reported:
//
//       checked=43 mismatched=0 aggregate=match      (exit 0)
//
//   Those are the fields a result-motivated edit would target, and the
//   continuation rule is the single registered commitment the whole
//   pre-registration exists to protect. `document_sha256` now covers the entire
//   document, and --verify reports coverage explicitly rather than letting
//   "aggregate=match" be read as "the freeze is intact".
//
//   This is tamper *evidence*, not tamper proofing: an editor who also re-seals
//   passes. The seal is committed, so a re-seal appears in the diff. Git remains
//   the underlying record; the seal makes an in-place edit fail loudly at the
//   point of use instead of silently at review time.

import { createHash, createHmac } from "node:crypto";
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { arch, platform } from "node:process";

// fileURLToPath, not `new URL(...).pathname`: the latter is percent-encoded, so
// a checkout under a path containing a space breaks on Linux too, not only on
// Windows where it also yields "/C:/…".
const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const base = resolve(root, "tasks/gate-h-heldout");
const verifyOnly = process.argv.includes("--verify");
const sealOnly = process.argv.includes("--seal");

/** Key-sorted JSON so a digest does not depend on property order. */
function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.entries(value)
    .sort(([l], [r]) => (l < r ? -1 : l > r ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`)
    .join(",")}}`;
}

/** Digest of the whole freeze document, excluding the digest field itself. */
function documentDigest(doc) {
  const { document_sha256: _omitted, ...rest } = doc;
  return sha256(canonicalJson(rest));
}

/** Top-level fields the v1 aggregate never covered. */
const AGGREGATE_COVERS = ["freeze_id", "artifacts", "corpus", "prompts", "model_settings", "schedule"];

const FREEZE_ID = "gate-h-heldout-2026-08-02";
const PROTOCOL = "gate-h-heldout-v1";
const SEED = "gate-h-heldout/schedule/2026-08-02";

// Frozen model settings. Reasoning effort is chosen now and may not be changed
// after any result is seen; a change creates a new experiment version.
const MODEL_SETTINGS = {
  model_alias: "gpt-5.6-luna",
  model_alias_is_mutable: true,
  immutable_snapshot_available: false,
  reasoning_effort: "low",
  store: false,
  tools: [],
  max_output_tokens: 8192,
  timeout_ms: 180_000,
  sdk_max_retries: 0,
  attempt_retries: 0,
  per_request_cap_usd: 0.05,
  session_cap_usd: 1.59,
  sdk_version: "7.3.0",
  documentation_evidence_id: "provider-contract-2026-08-02",
  pricing_snapshot_id: "openai-2026-08-02"
};

const SYSTEM_PROMPT = `You are fixing a defect in an existing software repository.

Make the smallest change that corrects the reported behaviour. Do not modify
tests. Do not modify unrelated files.

Reply with a single JSON object and nothing else:
{"files":[{"path":"<repository-relative path>","contents":"<complete new file contents>"}]}

Every file you list is written verbatim, so each "contents" must be the entire
final file, not a fragment or a diff.`;

const TASK_PROMPT_TEMPLATE = `<issue>
{{ISSUE}}
</issue>
{{ASSISTANCE}}
Repository root contains the project source. Apply your fix and reply with the
JSON object described in the system prompt.`;

const sha256 = (v) => createHash("sha256").update(v).digest("hex");
const hashFile = async (p) => sha256(await readFile(resolve(root, p)));

function git(args, cwd = root) {
  return new Promise((res, rej) => {
    const c = spawn("git", args, { cwd, shell: false, stdio: ["ignore", "pipe", "ignore"] });
    let out = "";
    c.stdout.on("data", (d) => (out += d));
    c.on("error", rej);
    c.on("close", (code) => (code === 0 ? res(out.trim()) : rej(new Error(`git ${args.join(" ")} exited ${code}`))));
  });
}

async function walk(dir) {
  const out = [];
  for (const e of await readdir(resolve(root, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) out.push(...(await walk(rel)));
    else out.push(rel);
  }
  return out.sort();
}

const corpus = JSON.parse(await readFile(resolve(base, "selected-corpus.json"), "utf8"));

// Stage A: one attempt per task per arm, ordered by a keyed shuffle so run
// order cannot track task or arm.
const cells = [];
for (const task of corpus.tasks) for (const arm of ["T0", "T1", "T2", "T3"]) cells.push({ task_id: task.task_id, treatment_id: arm });
const schedule = cells
  .map((c) => ({ ...c, order: createHmac("sha256", SEED).update(`${c.task_id}|${c.treatment_id}`).digest("hex") }))
  .sort((a, b) => (a.order < b.order ? -1 : 1))
  .map((c, i) => ({ sequence: i + 1, task_id: c.task_id, treatment_id: c.treatment_id }));

const artifacts = [];
for (const path of await walk("tasks/gate-h-heldout")) {
  if (path.endsWith("/freeze/identity.json")) continue;
  artifacts.push({ path, sha256: await hashFile(path) });
}
for (const path of [
  "scripts/gate-h-heldout/mine-candidates.mjs",
  "scripts/gate-h-heldout/validate-candidates.mjs",
  "scripts/gate-h-heldout/select-corpus.mjs",
  "scripts/gate-h-heldout/build-corpus.mjs",
  "scripts/gate-h-heldout/check-leakage.mjs",
  "scripts/gate-h-heldout/evaluate.mjs",
  "scripts/gate-h-heldout/run-stage-a.mjs",
  "src/providers/openai-transport.ts",
  "src/providers/openai-cost.ts",
  "src/providers/budget.ts",
  "src/providers/live-gate.ts",
  "src/providers/output-validation.ts",
  "data/pricing/openai-2026-08-02.evidence.json",
  "data/provider-evidence/manifest.json"
]) {
  artifacts.push({ path, sha256: await hashFile(path) });
}
artifacts.sort((a, b) => a.path.localeCompare(b.path));

const freeze = {
  schema_version: "1.0",
  freeze_id: FREEZE_ID,
  protocol_version: PROTOCOL,
  created_at: "2026-08-02T21:00:00Z",
  status: "frozen_pre_execution",
  live_calls_made: 0,
  capability_claim_permitted: false,
  held_out_meaning: corpus.held_out_meaning,
  code_identity: { commit: await git(["rev-parse", "HEAD"]), tree: await git(["rev-parse", "HEAD^{tree}"]) },
  environment: {
    platform,
    architecture: arch,
    node_versions_validated: ["v22.22.2", "v24.18.1"],
    python_version: "3.11.15",
    network_required_during_provisioning_only: true
  },
  corpus: {
    corpus_id: corpus.corpus_id,
    task_count: corpus.tasks.length,
    repositories: corpus.repositories,
    languages: corpus.languages,
    selection_policy: corpus.selection_policy,
    tasks: corpus.tasks.map((t) => ({
      task_id: t.task_id,
      repository: t.repository,
      language: t.language,
      base_commit: t.base_commit,
      corrected_commit: t.corrected_commit,
      permitted_paths: t.source_files,
      evaluator_test_files: t.evaluator_test_files,
      base_exit: t.base_exit,
      corrected_exit: t.corrected_exit
    })),
    not_selected: corpus.not_selected,
    rejected: corpus.rejected
  },
  arms: {
    T0: "native: issue and repository only",
    T1: "bounded context: paths, regions, base-state symbols, failing boundary",
    T2: "T1 plus raw reproduced observations from the base commit",
    T3: "T2 plus author-produced causal diagnosis and behavioral objective, deliberately combined"
  },
  t3_is_combined: true,
  t3_note: "No effect may be attributed to diagnosis rather than behavioral objective.",
  prompts: {
    system_prompt: SYSTEM_PROMPT,
    system_prompt_sha256: sha256(SYSTEM_PROMPT),
    task_prompt_template: TASK_PROMPT_TEMPLATE,
    task_prompt_template_sha256: sha256(TASK_PROMPT_TEMPLATE)
  },
  model_settings: MODEL_SETTINGS,
  schedule: { seed_sha256: sha256(SEED), stage_a_attempts: schedule.length, order: schedule },
  analysis_plan: {
    stage_a: "One attempt per task per arm. Exploratory and noisy; a single attempt per cell cannot separate a real effect from stochasticity.",
    continuation_rule:
      "Continue to Stage B only if at least one assisted arm (T1, T2 or T3) succeeds on at least two tasks where T0 fails. Registered before execution and not to be lowered afterwards.",
    stage_b: "Two additional repetitions for every task and every arm, not only successful arms. Report Stage A and Stage B together.",
    unit_of_generalization: "task",
    repetitions_are_not_independent_tasks: true,
    p_value: "not reported; the corpus is far too small for one to mean anything",
    reported_outcomes: [
      "evaluator success per attempt",
      "task-level consistent success",
      "cost per successful task",
      "wall time",
      "false completion",
      "regression introduction",
      "unnecessary files changed",
      "first-edit correctness"
    ],
    result_dependent_task_replacement: "prohibited"
  },
  leakage_controls: {
    implementation_sha256: await hashFile("scripts/gate-h-heldout/check-leakage.mjs"),
    report_sha256: await hashFile("tasks/gate-h-heldout/leakage-report.json"),
    is_heuristic: true,
    not_a_purity_proof: true
  },
  forbidden_claims: [
    "general Luna improvement",
    "benchmark leadership",
    "product readiness",
    "diagnosis alone caused an effect",
    "any fraction of a Luna-Sol gap (there is no matched Sol arm)",
    "statistical generalization",
    "independently validated intervention semantics"
  ],
  artifact_count: artifacts.length,
  artifacts
};

freeze.aggregate_sha256 = sha256(
  JSON.stringify({ freeze_id: FREEZE_ID, artifacts, corpus: freeze.corpus, prompts: freeze.prompts, model_settings: MODEL_SETTINGS, schedule: freeze.schedule })
);

const outPath = resolve(base, "freeze", "identity.json");

if (sealOnly) {
  // One-time establishment of a document digest over a freeze written before
  // document sealing existed. Refuses to overwrite a digest that is present and
  // wrong: that is a tampered document, not an unsealed one, and quietly
  // re-sealing it would destroy the only evidence.
  const existing = JSON.parse(await readFile(outPath, "utf8"));
  const digest = documentDigest(existing);
  if (typeof existing.document_sha256 === "string") {
    if (existing.document_sha256 === digest) {
      process.stdout.write(`already sealed: ${digest}\n`);
      process.exit(0);
    }
    process.stderr.write(
      `refusing to re-seal: the document carries ${existing.document_sha256} but hashes to ${digest}.\n` +
        "Something edited a sealed freeze. Inspect `git diff` before doing anything else.\n"
    );
    process.exit(1);
  }
  const sealed = { ...existing, document_sha256: digest };
  await writeFile(outPath, `${JSON.stringify(sealed, null, 2)}\n`);
  process.stdout.write(`sealed ${outPath}\ndocument_sha256: ${digest}\n`);
  process.exit(0);
}

if (verifyOnly) {
  const existing = JSON.parse(await readFile(outPath, "utf8"));
  let bad = 0;
  for (const a of existing.artifacts) {
    let actual = null;
    try {
      actual = await hashFile(a.path);
    } catch {
      /* missing */
    }
    if (actual !== a.sha256) {
      bad += 1;
      process.stdout.write(`MISMATCH ${a.path}\n`);
    }
  }
  const aggregateOk = existing.aggregate_sha256 === freeze.aggregate_sha256;

  // The document check. Without it, "aggregate=match" is read as "the freeze is
  // intact" while the continuation rule, the forbidden-claims list and the
  // execution counters sit entirely outside the hash.
  let documentState;
  if (typeof existing.document_sha256 !== "string") {
    documentState = "NOT_SEALED";
  } else {
    documentState = documentDigest(existing) === existing.document_sha256 ? "match" : "DIFFERS";
  }

  const uncovered = Object.keys(existing).filter(
    (k) => !AGGREGATE_COVERS.includes(k) && k !== "aggregate_sha256" && k !== "document_sha256"
  );

  process.stdout.write(
    `checked=${existing.artifacts.length} mismatched=${bad} aggregate=${aggregateOk ? "match" : "DIFFERS"} document=${documentState}\n`
  );
  process.stdout.write(`aggregate covers: ${AGGREGATE_COVERS.join(", ")}\n`);
  process.stdout.write(`aggregate does NOT cover (document digest does): ${uncovered.join(", ")}\n`);
  if (documentState === "NOT_SEALED") {
    process.stderr.write(
      "\nThis freeze has no document digest, so the registered analysis plan, the\n" +
        "forbidden-claims list and the execution counters are unverified. Establish\n" +
        "one only from a state you have confirmed against git:\n" +
        "  git diff --exit-code tasks/gate-h-heldout/freeze/identity.json\n" +
        "  node scripts/gate-h-heldout/freeze.mjs --seal\n"
    );
  }
  if (documentState === "DIFFERS") {
    process.stderr.write(
      "\nThe freeze document does not match its own seal. A field outside the\n" +
        "aggregate has been edited. Do not run anything against it; read `git diff`.\n"
    );
  }
  process.exit(bad === 0 && aggregateOk && documentState === "match" ? 0 : 1);
}

await mkdir(resolve(base, "freeze"), { recursive: true });
freeze.document_sha256 = documentDigest(freeze);
await writeFile(outPath, `${JSON.stringify(freeze, null, 2)}\n`);
process.stdout.write(
  `freeze_id: ${FREEZE_ID}\nartifacts: ${artifacts.length}\naggregate_sha256: ${freeze.aggregate_sha256}\n` +
    `document_sha256: ${freeze.document_sha256}\nstage_a_attempts: ${schedule.length}\n`
);
