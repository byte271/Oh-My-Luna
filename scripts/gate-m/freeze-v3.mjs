// Creates the Gate M V3 freeze for the simplified T0-T3 treatment design.
//
// Binds every input that must not move between now and the exploratory Gate H
// pilot: task identities, provisioning, evaluators, the T1/T2/T3 packets, the
// leakage report, the reviewer-free research policy, the code tree, the
// environment, and the negative controls.
//
// Self-contained. It does not depend on the V1 or V2 freezes, which remain
// untouched as research history; the link is provenance only.
//
// Usage: node scripts/gate-m/freeze-v3.mjs [--verify]

import { createHash } from "node:crypto";
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import { arch, platform } from "node:process";

const root = resolve(new URL("../..", import.meta.url).pathname);
const v3 = resolve(root, "tasks/gate-m-v3");
const verifyOnly = process.argv.includes("--verify");

const FREEZE_ID = "gate-m-treatments-v3-2026-08-02";
const PROTOCOL = "gate-m-treatments-v3";

const TASKS = [
  { task_id: "zod-tuple-default", repo: "colinhacks/zod", base: "ec979ad783a9e9c992d3c9bd4e5f3b56110b1ef8", corrected: "b6066b3e4730fc8b966d13974b4abae8dce25df4", base_archive: "db2a94e7fde8db8d3ea244df4dd94b3b8172d801e062384b5efc9dfbd7ffc72c", corrected_archive: "9223198b45c0e7b62bb24830b9c370493ffcc24968806fd360c96a3f47b7f142", license: "MIT" },
  { task_id: "zod-absent-catch", repo: "colinhacks/zod", base: "b8dffe9e62f17e6571e6249d05cc5102b54d94e4", corrected: "1cab69383fcdeae2a366d5e2a2fc4d8fc765d168", base_archive: "c5b0f46d101a54485e440382bb67852391771e98f941a50c6810b5dabc49c24c", corrected_archive: "3807313c68bad89e1d63a00a6fb5945a645a1b173262c9654b2828da21f71ddb", license: "MIT" },
  { task_id: "date-fns-zh-month", repo: "date-fns/date-fns", base: "39d1e14200cead9e4be5df88695b5e82082875ed", corrected: "b9c5865edb7610c59e6b3694ed1e1691f4807688", base_archive: "2521606bb70dd781849cc7a5f120ba09a89a3f9b0ab98ddfa984427ddd3ff00a", corrected_archive: "1fb62cb08a98addb864d5e37c63e7469f7f5b05fd66d80e842dc35835a1e2dbd", license: "MIT" },
  { task_id: "type-fest-conditional-keys", repo: "sindresorhus/type-fest", base: "b6d8dd60726a8d7df5a5eea3b3c9d830804d2570", corrected: "0fb2d62f7d222d3effb0ad89d5b340e36285bcc4", base_archive: "7fdeb70c2eab145029340e3c64288ad349bff000d2d3ad6ed1d2903bc8e5097c", corrected_archive: "747ea7d24e27ae6e97b46c3b4f3837e57b80facbce31a62ace479cd9ba00384d", license: "MIT OR CC0-1.0" },
];

const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");
const hashFile = async (path) => sha256(await readFile(resolve(root, path)));

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(resolve(root, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...(await walk(rel)));
    else out.push(rel);
  }
  return out.sort();
}

function git(args) {
  return new Promise((res, rej) => {
    const child = spawn("git", args, { cwd: root, shell: false, stdio: ["ignore", "pipe", "ignore"] });
    let out = "";
    child.stdout.on("data", (c) => (out += c));
    child.on("error", rej);
    child.on("close", (code) => (code === 0 ? res(out.trim()) : rej(new Error(`git ${args.join(" ")} exited ${code}`))));
  });
}

const artifacts = [];
const add = async (role, path) => artifacts.push({ role, path, sha256: await hashFile(path) });

for (const path of await walk("tasks/gate-m-v3")) {
  if (path.endsWith("/freeze/identity.json")) continue;
  const role = path.includes("/treatments/") ? "treatment_packet" : path.endsWith("leakage-report.json") ? "leakage_report" : path.endsWith("review-policy.json") ? "research_policy" : "v3_material";
  await add(role, path);
}

for (const task of TASKS) {
  await add("evaluator", `tasks/gate-m/${task.task_id}/control/evaluator/verify.mjs`);
  await add("manifest", `tasks/gate-m/${task.task_id}/manifest.json`);
  await add("visible_issue", `tasks/gate-m/${task.task_id}/visible/issue.md`);
}

for (const path of [
  "scripts/gate-m/provision-sources.mjs",
  "scripts/gate-m/validate-real-tasks.mjs",
  "scripts/gate-m/validate-kernel.mjs",
  "scripts/gate-m/build-v3-treatments.mjs",
  "scripts/gate-m/check-v3-leakage.mjs",
  "src/scoring.ts",
  "fixtures/smoke/deterministic-adapter.mjs",
  "data/pricing/openai-2026-08-02.evidence.json",
]) {
  await add("harness", path);
}

artifacts.sort((a, b) => a.path.localeCompare(b.path));

const freeze = {
  schema_version: "1.0",
  freeze_id: FREEZE_ID,
  protocol_version: PROTOCOL,
  created_at: "2026-08-02T18:00:00Z",
  phase: "gate_m_kernel_validated",
  status: "ready_for_exploratory_gate_h",
  capability_claim_permitted: false,
  supersedes: [
    { freeze_id: "gate-m-real-tasks-2026-08-02-pre-review-v1", relationship: "provenance_only", status: "preserved_unmodified" },
    { freeze_id: "gate-m-real-tasks-v2-2026-08-02-pre-review", relationship: "provenance_only", status: "preserved_unmodified" },
  ],
  code_identity: { commit: await git(["rev-parse", "HEAD"]), tree: await git(["rev-parse", "HEAD^{tree}"]) },
  environment: {
    platform,
    architecture: arch,
    node_versions_validated: ["v22.22.2", "v24.18.1"],
    clean_clone_provisioning_required: true,
    provisioning_entry_point: "npm run gate-m:provision",
    validation_entry_point: "npm run gate-m:validate",
    kernel_entry_point: "npm run gate-m:kernel",
    network_required_during_provisioning_only: true,
  },
  tasks: TASKS,
  treatment_design: {
    arms: ["T0", "T1", "T2", "T3"],
    t0_has_no_packet: true,
    t3_is_combined_arm: true,
    t3_combines: ["causal_diagnosis", "behavioral_objective"],
    five_level_ladder: "superseded",
    l3_l4_agreement_analysis: "discontinued",
  },
  semantic_review: {
    status: "optional_external_audit_evidence",
    is_merge_gate: false,
    is_execution_prerequisite: false,
    eligible_reviews_completed: 0,
    packet_status: "author_reviewed_semantic_separation_unverified",
    policy_sha256: await hashFile("tasks/gate-m-v3/review-policy.json"),
  },
  leakage_controls: {
    implementation_sha256: await hashFile("scripts/gate-m/check-v3-leakage.mjs"),
    report_sha256: await hashFile("tasks/gate-m-v3/leakage-report.json"),
    is_heuristic: true,
    not_a_purity_proof: true,
  },
  model_execution: { live_model_calls: false, adapter_id: "deterministic-test-double", model_snapshot: "test-double/not-a-model@fixture-1", reasoning_effort: "none" },
  negative_controls: [
    { id: "evaluator_argv_canary", test: "scorer declared interface rejects treatment canaries in argv, environment, stdin, and filenames" },
    { id: "evaluator_workspace_canary", test: "scorer rejects a canary embedded in a copied workspace filename" },
    { id: "adjacent_trace_isolation", test: "scorer uses a detached workspace and does not expose the adjacent orchestrator trace by its interface" },
    { id: "freeze_mutation_detection", test: "rejects packet modified after freeze" },
    { id: "control_path_leak", test: "user-visible receipt metadata rejects control-only artifact paths" },
    { id: "t0_has_no_packet", test: "validate-kernel treatment_specific_materialization" },
    { id: "no_repair_in_model_visible_material", test: "validate-kernel no_corrected_patch_in_model_visible_material" },
  ],
  scorer: { source_path: "src/scoring.ts", source_sha256: await hashFile("src/scoring.ts"), classification: "interface_blind_host_confidentiality_not_enforced" },
  artifact_count: artifacts.length,
  artifacts,
};

freeze.aggregate_sha256 = sha256(JSON.stringify({ freeze_id: FREEZE_ID, protocol_version: PROTOCOL, artifacts, tasks: freeze.tasks, treatment_design: freeze.treatment_design }));

const outPath = resolve(v3, "freeze", "identity.json");

if (verifyOnly) {
  const existing = JSON.parse(await readFile(outPath, "utf8"));
  let bad = 0;
  for (const artifact of existing.artifacts) {
    let actual = null;
    try {
      actual = await hashFile(artifact.path);
    } catch {
      /* missing */
    }
    if (actual !== artifact.sha256) {
      bad += 1;
      process.stdout.write(`MISMATCH ${artifact.path}\n  expect ${artifact.sha256}\n  actual ${actual ?? "MISSING"}\n`);
    }
  }
  const aggregateOk = existing.aggregate_sha256 === freeze.aggregate_sha256;
  process.stdout.write(`checked=${existing.artifacts.length} mismatched=${bad} aggregate=${aggregateOk ? "match" : "DIFFERS"}\n`);
  process.exit(bad === 0 && aggregateOk ? 0 : 1);
}

await mkdir(resolve(v3, "freeze"), { recursive: true });
await writeFile(outPath, `${JSON.stringify(freeze, null, 2)}\n`);
process.stdout.write(`freeze_id: ${FREEZE_ID}\nartifacts: ${artifacts.length}\naggregate_sha256: ${freeze.aggregate_sha256}\n`);
