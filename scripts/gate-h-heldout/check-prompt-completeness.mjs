// Detects whether the Stage A prompt actually contains the source the model is
// required to reproduce.
//
// Background: the frozen system prompt demands the *complete final contents* of
// every file the model changes, and the transport runs with `tools: []`. If the
// prompt does not carry the source, the model is being asked to reconstruct a
// file it has never seen and cannot read. Every arm would fail for a reason that
// has nothing to do with model capability.
//
// This check is deliberately offline and free. It reproduces Stage A's own
// prompt assembly and measures it. It contacts no provider.
//
// Usage:
//   node scripts/gate-h-heldout/check-prompt-completeness.mjs
//   node scripts/gate-h-heldout/check-prompt-completeness.mjs --json
//
// Exit codes:
//   0  every permitted file's source is present in the prompt
//   6  at least one permitted file's source is absent  (the defect)
//   7  corpus not provisioned; run `npm run heldout:provision` first

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
// fileURLToPath, not `new URL(...).pathname`. On Windows the latter yields
// "/C:/Users/...", which path.resolve treats as drive-relative and expands to
// "C:\C:\Users\...", so every read fails with ENOENT. Sibling scripts in this
// directory all carry that bug; most are inside the freeze and cannot be
// corrected without a re-freeze. See docs/gate-h-heldout-v2-plan.md §6.
const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const base = resolve(root, "tasks/gate-h-heldout");
const cache = resolve(root, ".gate-h-heldout-cache");
const JSON_OUT = process.argv.includes("--json");

const freeze = JSON.parse(await readFile(resolve(base, "freeze", "identity.json"), "utf8"));
const repoName = (task) => task.repository.split("/").pop();

// Mirrors buildPrompt() in run-stage-a.mjs exactly. If that function changes,
// this check must be updated with it, or it silently stops measuring reality.
async function buildPrompt(task, arm) {
  const issue = await readFile(resolve(base, "tasks", task.task_id, "visible", "issue.md"), "utf8");
  let assistance = "";
  if (arm !== "T0") {
    const packet = JSON.parse(await readFile(resolve(base, "tasks", task.task_id, "arms", `${arm}.json`), "utf8"));
    assistance = `\n<assistance>\n${JSON.stringify(packet.payload, null, 2)}\n</assistance>\n`;
  }
  return freeze.prompts.task_prompt_template
    .replace("{{ISSUE}}", issue.trim())
    .replace("{{ASSISTANCE}}", assistance);
}

async function fileAtBase(task, path) {
  const gitDir = resolve(cache, "repos", repoName(task), ".git");
  if (!existsSync(gitDir)) return null;
  const { stdout } = await execFileAsync(
    "git",
    ["-C", gitDir, "show", `${task.base_commit}:${path}`],
    { maxBuffer: 64 * 1024 * 1024 }
  );
  return stdout;
}

// Rough token estimate. Deliberately conservative (optimistic about packing) so
// the check under-reports rather than over-reports a problem.
const estTokens = (s) => Math.ceil(Buffer.byteLength(s, "utf8") / 4);

const maxOutput = freeze.model_settings.max_output_tokens;
const rows = [];
let anyAbsent = false;
let notProvisioned = false;

for (const task of freeze.corpus.tasks) {
  const control = JSON.parse(
    await readFile(resolve(base, "tasks", task.task_id, "control", "evaluator.json"), "utf8")
  );

  for (const arm of ["T0", "T1", "T2", "T3"]) {
    const prompt = await buildPrompt(task, arm);

    for (const path of control.permitted_paths) {
      const source = await fileAtBase(task, path);
      if (source === null) {
        notProvisioned = true;
        continue;
      }

      // The real question: does the prompt carry the code at all? Test a
      // distinctive interior slice rather than the whole file, so that
      // whitespace or line-ending differences cannot produce a false "absent".
      const lines = source.split("\n").filter((l) => l.trim().length > 12);
      const probe = lines.length > 0 ? lines[Math.floor(lines.length / 2)].trim() : null;
      const present = probe !== null && prompt.includes(probe);
      if (!present) anyAbsent = true;

      const sourceTokens = estTokens(source);
      rows.push({
        task_id: task.task_id,
        arm,
        path,
        source_present_in_prompt: present,
        prompt_tokens_est: estTokens(prompt),
        source_tokens_est: sourceTokens,
        // The model must emit the entire final file, so the output cap must
        // exceed the file itself with room for the JSON envelope and escaping.
        exceeds_max_output_tokens: sourceTokens > maxOutput,
        max_output_tokens: maxOutput
      });
    }
  }
}

if (notProvisioned && rows.length === 0) {
  process.stderr.write("corpus not provisioned; run: npm run heldout:provision\n");
  process.exit(7);
}

const absent = rows.filter((r) => !r.source_present_in_prompt);
const oversize = rows.filter((r) => r.exceeds_max_output_tokens);

const report = {
  schema_version: "1.0",
  check: "stage_a_prompt_completeness",
  freeze_id: freeze.freeze_id,
  protocol_version: freeze.protocol_version,
  contacted_provider: false,
  cost_usd: 0,
  rows_checked: rows.length,
  source_absent_count: absent.length,
  oversize_for_output_cap_count: oversize.length,
  verdict: absent.length > 0 ? "source_absent_from_prompt" : "source_present",
  rows
};

if (JSON_OUT) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} else {
  process.stdout.write(`freeze: ${freeze.freeze_id}  (${rows.length} task/arm/path combinations)\n\n`);
  const width = Math.max(...rows.map((r) => r.path.length), 4);
  for (const r of rows) {
    const flag = r.source_present_in_prompt ? "source:PRESENT" : "source:ABSENT";
    const cap = r.exceeds_max_output_tokens ? `  OVER-CAP(${r.source_tokens_est}>${maxOutput})` : "";
    process.stdout.write(
      `${r.task_id.padEnd(20)} ${r.arm}  ${r.path.padEnd(width)}  ${flag}  ` +
        `prompt~${String(r.prompt_tokens_est).padStart(6)}tok  source~${String(r.source_tokens_est).padStart(6)}tok${cap}\n`
    );
  }
  process.stdout.write(`\nsource absent: ${absent.length}/${rows.length}\n`);
  process.stdout.write(`source larger than max_output_tokens (${maxOutput}): ${oversize.length}/${rows.length}\n`);
  if (absent.length > 0) {
    process.stdout.write(
      "\nThe model is required to return complete file contents it was never shown\n" +
        "and cannot read (tools: []). Every arm would fail for a harness reason.\n" +
        "See research/gate-h-heldout/DEFECT-2026-08-03-unseen-source.md\n"
    );
  }
}

process.exit(absent.length > 0 ? 6 : 0);
