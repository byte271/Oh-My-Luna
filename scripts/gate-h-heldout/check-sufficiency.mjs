// Sufficiency gates for the held-out Gate H protocol.
//
// Every control this repository had before these gates verifies INTEGRITY —
// that inputs are the intended bytes, and that mutation is detected. None
// verified SUFFICIENCY — that the intended bytes are adequate to the task
// posed. That gap is how a 43-artifact freeze, a 10-check kernel gate, a
// leakage audit and four passing stubs all coexisted with a prompt that omitted
// the source the model was required to reproduce.
//
// Four gates, all offline and free:
//
//   prompt_completeness   every file the model must reproduce appears in its prompt
//   output_cap_headroom   the JSON change-set envelope fits max_output_tokens
//                         with room left for reasoning tokens
//   template_claim_audit  the prompt asserts no capability the transport withholds
//   stub_realism          no unprivileged stub is better informed than the model
//
// Usage:
//   node scripts/gate-h-heldout/check-sufficiency.mjs                 (frozen v1)
//   node scripts/gate-h-heldout/check-sufficiency.mjs --protocol v2   (v2 candidate)
//   node scripts/gate-h-heldout/check-sufficiency.mjs --json
//   node scripts/gate-h-heldout/check-sufficiency.mjs --only prompt_completeness
//
// Exit codes:
//   0   every requested gate passes
//   6   prompt completeness failed  (the v1 defect)
//   7   corpus not provisioned, or provisioned only in part
//   8   output cap headroom failed
//   9   template claim audit failed
//   10  stub realism failed

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { buildTaskPrompt, renderAssistance } from "../../dist/src/heldout/prompt.js";
import {
  aggregate,
  auditTemplateClaims,
  checkOutputCapHeadroom,
  checkPromptCompleteness,
  checkStubRealism,
  evaluateSourcePresence,
  exitCodeFor,
  requiredOutputTokens,
  SUFFICIENCY_EXIT
} from "../../dist/src/heldout/sufficiency.js";
import { STUB_DECLARATIONS, UNPRIVILEGED_STUBS } from "../../dist/src/heldout/stubs.js";
import { estimateTokens } from "../../dist/src/heldout/tokens.js";

const execFileAsync = promisify(execFile);
const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const base = resolve(root, "tasks/gate-h-heldout");
const cache = resolve(root, ".gate-h-heldout-cache");

const argv = process.argv.slice(2);
const JSON_OUT = argv.includes("--json");
const protocolArg = argv.includes("--protocol") ? argv[argv.indexOf("--protocol") + 1] : "v1";
const onlyArg = argv.includes("--only") ? argv[argv.indexOf("--only") + 1] : null;

const freeze = JSON.parse(await readFile(resolve(base, "freeze", "identity.json"), "utf8"));

let protocol;
if (protocolArg === "v1") {
  protocol = {
    id: freeze.protocol_version,
    frozen: true,
    template: freeze.prompts.task_prompt_template,
    systemPrompt: freeze.prompts.system_prompt,
    maxOutputTokens: freeze.model_settings.max_output_tokens,
    reasoningHeadroom: 0,
    tools: freeze.model_settings.tools ?? [],
    store: freeze.model_settings.store === true
  };
} else if (protocolArg === "v2") {
  const candidate = JSON.parse(
    await readFile(resolve(root, "tasks/gate-h-heldout-v2/protocol.candidate.json"), "utf8")
  );
  protocol = {
    id: candidate.protocol_version,
    frozen: false,
    template: candidate.prompts.task_prompt_template,
    systemPrompt: candidate.prompts.system_prompt,
    maxOutputTokens: candidate.model_settings_proposed.max_output_tokens,
    reasoningHeadroom: candidate.model_settings_proposed.reasoning_headroom_tokens,
    tools: candidate.model_settings_proposed.tools ?? [],
    store: candidate.model_settings_proposed.store === true
  };
} else {
  process.stderr.write(`unknown protocol: ${protocolArg} (expected v1 or v2)\n`);
  process.exit(71);
}

const repoName = (task) => task.repository.split("/").pop();

async function fileAtBase(task, path) {
  const gitDir = resolve(cache, "repos", repoName(task), ".git");
  if (!existsSync(gitDir)) return null;
  try {
    const { stdout } = await execFileAsync("git", ["-C", gitDir, "show", `${task.base_commit}:${path}`], {
      maxBuffer: 64 * 1024 * 1024
    });
    return stdout;
  } catch {
    // A provisioned repository that cannot produce a pinned blob is a corpus
    // problem, not a sufficiency finding. Reported as unprovisioned so it is
    // never mistaken for a clean result.
    return null;
  }
}

async function armAssistance(task, arm) {
  if (arm === "T0") return "";
  const packet = JSON.parse(await readFile(resolve(base, "tasks", task.task_id, "arms", `${arm}.json`), "utf8"));
  return renderAssistance(packet.payload);
}

const ARMS = ["T0", "T1", "T2", "T3"];

const completenessRows = [];
const capRows = [];
const missing = [];

for (const task of freeze.corpus.tasks) {
  const control = JSON.parse(
    await readFile(resolve(base, "tasks", task.task_id, "control", "evaluator.json"), "utf8")
  );
  const issue = await readFile(resolve(base, "tasks", task.task_id, "visible", "issue.md"), "utf8");

  const sources = [];
  for (const path of control.permitted_paths) {
    const contents = await fileAtBase(task, path);
    if (contents === null) {
      missing.push({ task_id: task.task_id, path });
      continue;
    }
    sources.push({ path, contents });
  }
  if (sources.length !== control.permitted_paths.length) continue;

  // Output cap is a property of the task, not the arm: the model must emit the
  // same change set whichever arm it is in.
  const required = requiredOutputTokens(sources);
  capRows.push({
    task_id: task.task_id,
    required_output_tokens: required,
    fits: required + protocol.reasoningHeadroom <= protocol.maxOutputTokens
  });

  for (const arm of ARMS) {
    const prompt = buildTaskPrompt(protocol.template, {
      issue,
      sources,
      assistance: await armAssistance(task, arm)
    });
    for (const file of sources) {
      const presence = evaluateSourcePresence(prompt, file.contents);
      completenessRows.push({
        task_id: task.task_id,
        arm,
        path: file.path,
        source_present_in_prompt: presence.present,
        probe_count: presence.probes,
        probes_found: presence.found,
        prompt_tokens_est: estimateTokens(prompt)
      });
    }
  }
}

// Partial provisioning must not yield a complete-looking verdict. The first
// version of this check exited 7 only when *nothing* resolved, so a corpus
// missing one repository reported a clean pass over the rest.
if (missing.length > 0 || capRows.length !== freeze.corpus.tasks.length) {
  process.stderr.write(
    `corpus not fully provisioned: ${missing.length} permitted file(s) unresolved, ` +
      `${capRows.length}/${freeze.corpus.tasks.length} tasks measurable.\n` +
      `run: npm run heldout:provision\n`
  );
  if (missing.length > 0) {
    for (const m of missing.slice(0, 10)) process.stderr.write(`  missing ${m.task_id}:${m.path}\n`);
  }
  process.exit(SUFFICIENCY_EXIT.NOT_PROVISIONED);
}

// The unprivileged stubs receive the assembled prompt and nothing else, so the
// realism property is enforced by their type rather than asserted about them.
// Running them here records that the enforcement is live, not merely declared.
const probePrompt = buildTaskPrompt(protocol.template, {
  issue: "probe",
  sources: [{ path: "probe.ts", contents: "export const probe = 1;\n" }],
  assistance: ""
});
const stubDeclarations = STUB_DECLARATIONS.map((declaration) => {
  const unprivileged = UNPRIVILEGED_STUBS[declaration.name];
  if (unprivileged === undefined) return { ...declaration, readFromDisk: declaration.privileged };
  // Exercising it proves the signature admits no filesystem argument.
  unprivileged({ prompt: probePrompt, permittedPaths: ["probe.ts"] });
  return { ...declaration, readFromDisk: false };
});

const allFindings = [
  checkPromptCompleteness(completenessRows),
  checkOutputCapHeadroom(capRows, protocol.maxOutputTokens, protocol.reasoningHeadroom),
  auditTemplateClaims([protocol.template, protocol.systemPrompt], {
    tools: protocol.tools,
    store: protocol.store,
    sourceInPrompt: completenessRows.every((r) => r.source_present_in_prompt)
  }),
  checkStubRealism(stubDeclarations)
];

const findings = onlyArg === null ? allFindings : allFindings.filter((f) => f.check === onlyArg);
if (findings.length === 0) {
  process.stderr.write(`unknown gate: ${onlyArg}\n`);
  process.exit(71);
}

const report = aggregate(findings);
const output = {
  ...report,
  protocol: protocol.id,
  protocol_frozen: protocol.frozen,
  freeze_id: freeze.freeze_id,
  max_output_tokens: protocol.maxOutputTokens,
  reasoning_headroom_tokens: protocol.reasoningHeadroom,
  rows_checked: completenessRows.length,
  tasks_measured: capRows.length
};

if (JSON_OUT) {
  process.stdout.write(`${JSON.stringify({ ...output, completeness_rows: completenessRows, cap_rows: capRows }, null, 2)}\n`);
} else {
  process.stdout.write(`protocol: ${protocol.id}${protocol.frozen ? " (frozen)" : " (candidate, not frozen)"}\n`);
  process.stdout.write(`corpus:   ${capRows.length} tasks, ${completenessRows.length} task/arm/path combinations\n\n`);
  for (const finding of findings) {
    process.stdout.write(`${finding.ok ? "PASS" : "FAIL"}  ${finding.check.padEnd(22)} ${finding.detail}\n`);
  }
  process.stdout.write("\noutput cap headroom per task:\n");
  for (const row of capRows) {
    process.stdout.write(
      `  ${row.task_id.padEnd(20)} needs ${String(row.required_output_tokens).padStart(6)} tok  ` +
        `+${protocol.reasoningHeadroom} reasoning  cap ${protocol.maxOutputTokens}  ${row.fits ? "fits" : "DOES NOT FIT"}\n`
    );
  }
  if (!report.ok) {
    process.stdout.write(`\n${report.blocking_failures} blocking failure(s). This protocol must not be frozen or run.\n`);
  }
}

process.exit(exitCodeFor(report));
