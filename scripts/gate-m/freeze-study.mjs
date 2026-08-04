import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { spawn } from "node:child_process";

const root = resolve(new URL("../..", import.meta.url).pathname);
const tracked = (await git(["ls-files"])).trim().split("\n").filter(Boolean);
const included = tracked.filter((path) =>
  path.startsWith("tasks/gate-m/") ||
  path.startsWith("scripts/gate-m/") ||
  [
    "package.json", "package-lock.json", "research/intervention-authoring-rubric.md", "research/method-validation-plan.md",
    "schemas/intervention-draft.schema.json", "schemas/intervention-packet.schema.json", "schemas/intervention-review.schema.json",
    "schemas/gate-m-study-freeze.schema.json", "schemas/run-receipt/schema.json", "schemas/task-manifest.schema.json", "schemas/task-pool.schema.json",
    "src/intervention-drafts.ts", "src/interventions.ts", "src/scoring.ts", "src/runner.ts", "src/gate-m-freeze.ts", "src/process.ts", "src/environment.ts", "src/errors.ts", "src/types.ts",
    "fixtures/smoke/deterministic-adapter.mjs", "data/pricing/openai-2026-08-02.evidence.json"
  ].includes(path)
).filter((path) => path !== "tasks/gate-m/freeze/identity.json");

const artifacts = [];
for (const path of included.sort()) artifacts.push({ role: roleFor(path), path, sha256: sha256(await readFile(resolve(root, path))) });
const codeCommit = (await git(["rev-parse", "HEAD"])).trim();
const codeTree = (await git(["rev-parse", "HEAD^{tree}"])).trim();
const policyPath = "tasks/gate-m/review-control/policy.json";
const schedulePath = "tasks/gate-m/review-control/schedule.json";
const scorerPath = "src/scoring.ts";
const pricingPath = "data/pricing/openai-2026-08-02.evidence.json";
const adapterPath = "fixtures/smoke/deterministic-adapter.mjs";
const taskIds = ["zod-tuple-default", "zod-absent-catch", "date-fns-zh-month", "type-fest-conditional-keys"];
const pool = JSON.parse(await readFile(resolve(root, "tasks/gate-m/candidate-pool.json"), "utf8"));
const tasks = [];
for (const taskId of taskIds) {
  const manifestPath = `tasks/gate-m/${taskId}/manifest.json`;
  const manifest = JSON.parse(await readFile(resolve(root, manifestPath), "utf8"));
  const candidate = pool.candidates.find((item) => item.id === taskId);
  tasks.push({
    task_id: taskId,
    manifest_sha256: sha256(await readFile(resolve(root, manifestPath))),
    base_commit: manifest.repository.base_commit,
    corrected_commit: manifest.repository.fixed_commit,
    evaluator_sha256: manifest.hashes.hidden_verifier_sha256,
    environment_definition_sha256: candidate.environment.definition_sha256
  });
}
const freeze = {
  schema_version: "0.1",
  freeze_id: "gate-m-real-tasks-2026-08-02-pre-review-v1",
  created_at: "2026-08-02T07:00:00Z",
  phase: "gate_m_method_validation",
  status: "pre_review",
  capability_claim_permitted: false,
  code_identity: { commit: codeCommit, tree: codeTree },
  model_execution: {
    live_model_calls: false,
    adapter_id: "deterministic-test-double",
    adapter_sha256: sha256(await readFile(resolve(root, adapterPath))),
    model_snapshot: "test-double/not-a-model@fixture-1",
    reasoning_effort: "none",
    prompt_sha256: null,
    skill_sha256: null
  },
  review: {
    policy_sha256: sha256(await readFile(resolve(root, policyPath))),
    blinded_schedule_sha256: sha256(await readFile(resolve(root, schedulePath))),
    required_distinct_reviewers: 2,
    completed_distinct_reviewers: 0,
    agreement_status: "pending"
  },
  treatment_execution: {
    executable: false,
    schedule_sha256: null,
    blocked_by: ["independent semantic reviews incomplete", "no approved intervention packets", "L3/L4 collapse decision pending"]
  },
  scorer: { source_path: scorerPath, source_sha256: sha256(await readFile(resolve(root, scorerPath))), classification: "interface_blind_host_confidentiality_not_enforced" },
  pricing: { path: pricingPath, sha256: sha256(await readFile(resolve(root, pricingPath))), snapshot_id: "openai-standard-pricing-2026-08-02" },
  tasks,
  artifacts,
  aggregate_sha256: "0".repeat(64)
};
const identity = structuredClone(freeze);
delete identity.aggregate_sha256;
freeze.aggregate_sha256 = sha256(canonicalJson(identity));
const output = resolve(root, "tasks/gate-m/freeze/identity.json");
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(freeze, null, 2)}\n`, "utf8");
process.stdout.write(`${freeze.freeze_id} ${freeze.aggregate_sha256}\n`);

function roleFor(path) {
  if (path.includes("/interventions/")) return "intervention_draft";
  if (path.includes("/review-") || path.includes("/reviews/") || path.includes("review-control") || path.includes("review-export")) return path.endsWith("schedule.json") ? "schedule" : "review";
  if (path.includes("/control/evaluator/")) return "evaluator";
  if (path.endsWith("task-validation.json")) return "environment";
  if (path.startsWith("data/pricing/")) return "pricing";
  if (path === "src/scoring.ts") return "scorer";
  if (path === "fixtures/smoke/deterministic-adapter.mjs") return "adapter";
  if (path.startsWith("tasks/gate-m/") && (path.endsWith("manifest.json") || path.endsWith("candidate-pool.json") || path.includes("/visible/"))) return "task";
  if (path.startsWith("src/") || path.startsWith("schemas/") || path.startsWith("scripts/")) return "code";
  return "protocol";
}

function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}
async function git(args) {
  return await new Promise((resolvePromise, reject) => {
    const child = spawn("git", args, { cwd: root, env: { PATH: process.env.PATH, GIT_DIR: resolve(root, ".gitdata"), GIT_WORK_TREE: root }, shell: false, stdio: ["ignore", "pipe", "pipe"] });
    const stdout = []; const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk)); child.stderr.on("data", (chunk) => stderr.push(chunk)); child.once("error", reject);
    child.once("close", (code) => code === 0 ? resolvePromise(Buffer.concat(stdout).toString("utf8")) : reject(new Error(Buffer.concat(stderr).toString("utf8"))));
  });
}
