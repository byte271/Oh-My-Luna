// Creates the Gate M V2 pre-review freeze.
//
// Binds every input that must not move between now and the two policy-eligible
// reviews: task identities, provisioning, evaluators, packets, the neutral
// review export, the rubric, the reviewer policy, the L3/L4 threshold, the
// ordering seed, the code tree, and the negative controls.
//
// The V2 freeze is self-contained. It does not depend on the V1 freeze and does
// not reference V1 hashes as inputs; the link between them is provenance only,
// recorded under `supersedes`.
//
// Usage: node scripts/gate-m/freeze-v2.mjs [--verify]

import { createHash } from "node:crypto";
import { readdir, readFile, stat, writeFile, mkdir } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { spawn } from "node:child_process";
import { arch, platform } from "node:process";

const root = resolve(new URL("../..", import.meta.url).pathname);
const v2 = resolve(root, "tasks/gate-m-v2");
const verifyOnly = process.argv.includes("--verify");

const FREEZE_ID = "gate-m-real-tasks-v2-2026-08-02-pre-review";
const PROTOCOL = "gate-m-real-tasks-v2";
const SEED = "gate-m-v2/review-order/2026-08-02/pre-review";

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

// Packets, review export, review control, rubric, evidence probes.
for (const path of await walk("tasks/gate-m-v2")) {
  if (path.endsWith("/freeze/identity.json")) continue;
  const role = path.includes("/review-export/")
    ? "review_export"
    : path.includes("/review-control/")
      ? "review_control"
      : path.includes("/interventions/")
        ? "packet"
        : path.includes("/evidence/")
          ? "diagnosis_evidence"
          : "v2_material";
  await add(role, path);
}

// Task material reused unchanged from V1: evaluators, manifests, visible issues.
for (const task of TASKS) {
  await add("evaluator", `tasks/gate-m/${task.task_id}/control/evaluator/verify.mjs`);
  await add("manifest", `tasks/gate-m/${task.task_id}/manifest.json`);
  await add("visible_issue", `tasks/gate-m/${task.task_id}/visible/issue.md`);
}

// Harness, provisioning and pricing.
for (const path of [
  "scripts/gate-m/provision-sources.mjs",
  "scripts/gate-m/validate-real-tasks.mjs",
  "scripts/gate-m/build-v2-corpus.mjs",
  "scripts/gate-m/generate-v2-review-bundles.mjs",
  "src/scoring.ts",
  "fixtures/smoke/deterministic-adapter.mjs",
  "data/pricing/openai-2026-08-02.evidence.json",
]) {
  await add("harness", path);
}

artifacts.sort((a, b) => a.path.localeCompare(b.path));

const mapping = JSON.parse(await readFile(resolve(v2, "review-control", "bundle-mapping.json"), "utf8"));

const freeze = {
  schema_version: "1.0",
  freeze_id: FREEZE_ID,
  protocol_version: PROTOCOL,
  created_at: "2026-08-02T12:00:00Z",
  phase: "gate_m_method_validation",
  status: "pre_review",
  capability_claim_permitted: false,
  supersedes: {
    freeze_id: "gate-m-real-tasks-2026-08-02-pre-review-v1",
    relationship: "provenance_only",
    note: "V2 does not depend on the V1 freeze. V1 is preserved intact as a rejected protocol version; see tasks/gate-m/V1-STATUS.md.",
  },
  code_identity: {
    commit: await git(["rev-parse", "HEAD"]),
    tree: await git(["rev-parse", "HEAD^{tree}"]),
  },
  environment: {
    platform,
    architecture: arch,
    node_versions_validated: ["v22.22.2", "v24.18.1"],
    clean_clone_provisioning_required: true,
    provisioning_entry_point: "npm run gate-m:provision",
    validation_entry_point: "npm run gate-m:validate",
    network_required_during_provisioning_only: true,
  },
  tasks: TASKS.map((task) => ({ ...task, repositories_represented: 3 })),
  model_execution: {
    live_model_calls: false,
    adapter_id: "deterministic-test-double",
    model_snapshot: "test-double/not-a-model@fixture-1",
    reasoning_effort: "none",
  },
  review: {
    policy_sha256: await hashFile("tasks/gate-m-v2/review-control/policy.json"),
    rubric_sha256: await hashFile("tasks/gate-m-v2/review-export/RUBRIC.md"),
    required_distinct_reviewers: 2,
    completed_distinct_reviewers: 0,
    agreement_status: "pending",
    l3_l4_threshold: 0.8,
    l3_l4_decision: "pending",
    structural_level_cue_removed: true,
    randomization: {
      seed_sha256: sha256(SEED),
      seed_is_controller_only: true,
      bundle_display_order: mapping.display_order,
    },
  },
  negative_controls: [
    { id: "evaluator_argv_canary", description: "Evaluator must not receive treatment identity through argv.", test: "scorer declared interface rejects treatment canaries in argv, environment, stdin, and filenames" },
    { id: "evaluator_env_canary", description: "Evaluator must not receive treatment identity through the environment.", test: "scorer declared interface rejects treatment canaries in argv, environment, stdin, and filenames" },
    { id: "evaluator_workspace_canary", description: "Evaluator must not read treatment identity from workspace filenames.", test: "scorer rejects a canary embedded in a copied workspace filename" },
    { id: "adjacent_trace_isolation", description: "Evaluator must not reach the orchestrator trace beside its workspace.", test: "scorer uses a detached workspace and does not expose the adjacent orchestrator trace by its interface" },
    { id: "freeze_mutation_detection", description: "Mutating a bound packet must fail closed.", test: "rejects packet modified after freeze" },
    { id: "pre_review_not_executable", description: "A pre-review freeze must not be usable as an executable schedule.", test: "pre-review freeze cannot masquerade as executable" },
    { id: "control_path_leak", description: "User-visible receipts must reject controller-only artifact paths.", test: "user-visible receipt metadata rejects control-only artifact paths" },
  ],
  scorer: {
    source_path: "src/scoring.ts",
    source_sha256: await hashFile("src/scoring.ts"),
    classification: "interface_blind_host_confidentiality_not_enforced",
  },
  treatment_execution: {
    executable: false,
    schedule_sha256: null,
    blocked_by: [
      "zero policy-eligible independent reviews completed (0 of 2 required)",
      "no approved intervention packets",
      "L3/L4 collapse decision pending",
    ],
  },
  artifact_count: artifacts.length,
  artifacts,
};

freeze.aggregate_sha256 = sha256(
  JSON.stringify({ freeze_id: FREEZE_ID, protocol_version: PROTOCOL, artifacts, tasks: freeze.tasks, review: freeze.review })
);

const outPath = resolve(v2, "freeze", "identity.json");

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
  process.stdout.write(`checked=${existing.artifacts.length} mismatched=${bad}\n`);
  process.stdout.write(`aggregate ${aggregateOk ? "matches" : "DIFFERS"}: ${existing.aggregate_sha256}\n`);
  process.exit(bad === 0 && aggregateOk ? 0 : 1);
}

await mkdir(resolve(v2, "freeze"), { recursive: true });
await writeFile(outPath, `${JSON.stringify(freeze, null, 2)}\n`);
process.stdout.write(`freeze_id: ${FREEZE_ID}\nartifacts: ${artifacts.length}\naggregate_sha256: ${freeze.aggregate_sha256}\n`);
