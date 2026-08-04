// Selects the final held-out corpus from validated candidates.
//
// The policy below is mechanical and is applied without reference to any model
// result, because no model has been run against any candidate. Selection
// therefore cannot be biased by outcomes — there are no outcomes yet.
//
// Policy, in order:
//   1. only candidates whose base fails and whose corrected passes
//   2. at most 2 tasks per repository, for repository-disjoint reporting
//   3. both languages represented, without accepting a weak task to force it
//   4. prefer smaller diffs: a bounded defect is a cleaner unit of measurement
//   5. deterministic tie-break on candidate_id
//
// Usage: node scripts/gate-h-heldout/select-corpus.mjs

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(new URL("../..", import.meta.url).pathname);

const MAX_PER_REPOSITORY = 2;
const TARGET_SIZE = 5;

const pool = JSON.parse(await readFile(resolve(root, "tasks/gate-h-heldout/candidate-pool.json"), "utf8"));
const validation = JSON.parse(await readFile(resolve(root, "tasks/gate-h-heldout/validation-results.json"), "utf8"));

const byId = new Map(pool.candidates.map((c) => [c.candidate_id, c]));
const verdict = new Map(validation.results.map((r) => [r.candidate_id, r]));

const eligible = validation.results
  .filter((r) => r.status === "accepted_candidate")
  .map((r) => ({ ...byId.get(r.candidate_id), validation: r }))
  .sort((a, b) => a.insertions - b.insertions || a.candidate_id.localeCompare(b.candidate_id));

const selected = [];
const perRepo = new Map();
for (const candidate of eligible) {
  if (selected.length >= TARGET_SIZE) break;
  const used = perRepo.get(candidate.repository_name) ?? 0;
  if (used >= MAX_PER_REPOSITORY) continue;
  selected.push(candidate);
  perRepo.set(candidate.repository_name, used + 1);
}

const languages = new Set(selected.map((c) => c.language));
if (!languages.has("python") || !(languages.has("typescript") || languages.has("javascript"))) {
  throw new Error(`Language coverage rule not satisfied: ${[...languages].join(", ")}`);
}

const rejected = validation.results
  .filter((r) => r.status !== "accepted_candidate")
  .map((r) => ({
    candidate_id: r.candidate_id,
    repository: r.repository,
    language: r.language,
    rejection_reason: r.rejection_reason,
    base_exit: r.base_exit ?? null,
    corrected_exit: r.corrected_exit ?? null
  }));

const notSelected = eligible
  .filter((c) => !selected.includes(c))
  .map((c) => ({
    candidate_id: c.candidate_id,
    repository_name: c.repository_name,
    reason:
      (perRepo.get(c.repository_name) ?? 0) >= MAX_PER_REPOSITORY
        ? `repository cap of ${MAX_PER_REPOSITORY} already met`
        : "target corpus size reached"
  }));

const corpus = {
  schema_version: "1.0",
  corpus_id: "gate-h-heldout-2026-08-02",
  selection_policy: {
    applied_before_any_model_run: true,
    no_model_result_existed_at_selection_time: true,
    max_per_repository: MAX_PER_REPOSITORY,
    target_size: TARGET_SIZE,
    ordering: "insertions ascending, then candidate_id",
    language_rule: "python and at least one of typescript/javascript must both appear",
    result_dependent_replacement: "prohibited"
  },
  held_out_meaning:
    "Held out from protocol design, intervention-level design, adapter implementation, output-parser implementation, evaluator-framework design, leakage-detector tuning, baseline prompt tuning, reasoning-effort selection, and all previous Luna or Sol runs. NOT blind to the task and intervention authors, who inspected the known correction to build the evaluator and author T1-T3. This is not a hidden benchmark.",
  examined: validation.examined,
  accepted_count: selected.length,
  repositories: [...new Set(selected.map((c) => c.repository))],
  languages: [...languages],
  tasks: selected.map((c) => ({
    task_id: c.candidate_id,
    repository: c.repository,
    repository_name: c.repository_name,
    language: c.language,
    runner: c.runner,
    base_commit: c.base_commit,
    corrected_commit: c.fix_commit,
    source_files: c.source_files,
    evaluator_test_files: c.test_files,
    upstream_subject: c.subject,
    insertions: c.insertions,
    base_exit: c.validation.base_exit,
    corrected_exit: c.validation.corrected_exit,
    setup_ms: c.validation.setup_ms ?? null,
    evaluator_ms: c.validation.evaluator_ms ?? null
  })),
  not_selected: notSelected,
  rejected
};

await writeFile(resolve(root, "tasks/gate-h-heldout/selected-corpus.json"), `${JSON.stringify(corpus, null, 2)}\n`);

process.stdout.write(`selected ${selected.length} across ${corpus.repositories.length} repositories (${[...languages].join(", ")})\n`);
for (const t of corpus.tasks) process.stdout.write(`  ${t.task_id}  [${t.language}]  ${t.upstream_subject.slice(0, 64)}\n`);
process.stdout.write(`not selected: ${notSelected.length}, rejected: ${rejected.length}\n`);
void verdict;
