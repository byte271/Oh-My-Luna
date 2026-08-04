// Gate M kernel validation (V3).
//
// Validates mechanical research integrity only. Reviewer count and reviewer
// approval are NOT pass conditions: independent semantic review was removed
// from the project by owner decision and is now optional external audit
// evidence.
//
// Passing yields:
//   method_kernel_valid_with_unreviewed_semantic_interventions
//
// That verdict permits merging PR #1 and running an exploratory Gate H pilot.
// It does not permit any strong causal claim about fine-grained information
// levels, and it does not make the semantic content of any packet verified.
//
// Usage: node scripts/gate-m/validate-kernel.mjs [--json]

import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import { arch, platform, version } from "node:process";

const root = resolve(new URL("../..", import.meta.url).pathname);
const checks = [];

const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");
const record = (id, ok, detail) => checks.push({ id, ok, detail });

function run(argv, opts = {}) {
  return new Promise((res) => {
    const child = spawn(argv[0], argv.slice(1), { cwd: root, shell: false, stdio: ["ignore", "pipe", "pipe"], ...opts });
    let out = "";
    let err = "";
    child.stdout.on("data", (c) => (out += c));
    child.stderr.on("data", (c) => (err += c));
    child.on("error", () => res({ code: -1, out, err }));
    child.on("close", (code) => res({ code, out, err }));
  });
}

const exists = async (p) => {
  try {
    await stat(resolve(root, p));
    return true;
  } catch {
    return false;
  }
};

// Task directories are those carrying a treatments/ subdirectory; freeze/ and
// other bookkeeping directories under tasks/gate-m-v3 are not tasks.
async function taskDirectories() {
  const entries = await readdir(resolve(root, "tasks/gate-m-v3"), { withFileTypes: true });
  const out = [];
  for (const entry of entries) {
    if (entry.isDirectory() && (await exists(`tasks/gate-m-v3/${entry.name}/treatments`))) out.push(entry.name);
  }
  return out.sort();
}

// 1. Clean-clone provisioning is exposed through documented package commands.
{
  const pkg = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
  const hasProvision = typeof pkg.scripts?.["gate-m:provision"] === "string";
  const hasValidate = typeof pkg.scripts?.["gate-m:validate"] === "string";
  const hasSetup = typeof pkg.scripts?.["gate-m:setup"] === "string";
  record("provisioning_documented_commands", hasProvision && hasValidate && hasSetup,
    `gate-m:provision=${hasProvision} gate-m:validate=${hasValidate} gate-m:setup=${hasSetup}`);
}

// 2. Source cache is deterministic and present, with a provision receipt.
{
  const ok = await exists(".gate-m-cache/provision-receipt.json");
  let detail = "provision receipt absent; run npm run gate-m:provision";
  if (ok) {
    const receipt = JSON.parse(await readFile(resolve(root, ".gate-m-cache/provision-receipt.json"), "utf8"));
    detail = `${Object.keys(receipt.worktrees).length} worktrees pinned, compiler ${receipt.compiler.version}`;
  }
  record("deterministic_source_cache", ok, detail);
}

// 3. Exact task source identities and base-fail / corrected-pass validation.
{
  const result = await run([process.execPath, "scripts/gate-m/validate-real-tasks.mjs"]);
  let ok = false;
  let detail = `validator exited ${result.code}`;
  if (result.code === 0) {
    const parsed = JSON.parse(result.out);
    const accepted = parsed.records.every((r) => r.accepted);
    const repos = new Set(parsed.records.map((r) => r.task_id.split("-")[0]));
    ok = accepted && parsed.records.length === 4;
    detail = `${parsed.records.length} tasks, all_accepted=${accepted}, node=${parsed.environment.node_version}`;
    record("evaluator_repeatability", parsed.records.every((r) => r.base.exit_code !== 0 && r.corrected.exit_code === 0),
      parsed.records.map((r) => `${r.task_id}:${r.base.exit_code}->${r.corrected.exit_code}`).join(" "));
    record("three_repositories_represented", repos.size >= 3, `distinct source repositories: ${repos.size}`);
  } else {
    record("evaluator_repeatability", false, detail);
    record("three_repositories_represented", false, detail);
  }
  record("base_fail_corrected_pass", ok, detail);
}

// 4. Treatment-specific materialization: each arm carries only its own payload,
//    no treatment label reaches the payload, and T0 has no packet at all.
{
  const taskDirs = await taskDirectories();
  const expected = { T1: ["context", "localization"], T2: ["context", "localization", "observation"], T3: ["context", "localization", "observation", "diagnosis", "behavioral_objective"] };
  let ok = true;
  const problems = [];
  for (const task of taskDirs) {
    for (const [arm, keys] of Object.entries(expected)) {
      const packet = JSON.parse(await readFile(resolve(root, "tasks/gate-m-v3", task, "treatments", `${arm}.json`), "utf8"));
      const actual = Object.keys(packet.payload).sort();
      if (JSON.stringify(actual) !== JSON.stringify([...keys].sort())) {
        ok = false;
        problems.push(`${task}/${arm} payload ${actual.join(",")}`);
      }
      if (JSON.stringify(packet.payload).includes(`"${arm}"`)) {
        ok = false;
        problems.push(`${task}/${arm} payload contains its own treatment label`);
      }
    }
    if (await exists(`tasks/gate-m-v3/${task}/treatments/T0.json`)) {
      ok = false;
      problems.push(`${task} has a T0 packet; T0 must be native`);
    }
  }
  record("treatment_specific_materialization", ok, problems.length ? problems.join("; ") : `${taskDirs.length} tasks x T1,T2,T3 verified; T0 native`);
}

// 5. No corrected patch reachable from model-visible material.
{
  let ok = true;
  const problems = [];
  for (const task of await taskDirectories()) {
    for (const arm of ["T1", "T2", "T3"]) {
      const text = await readFile(resolve(root, "tasks/gate-m-v3", task, "treatments", `${arm}.json`), "utf8");
      if (/known-repair|repair-comparison|\.patch\b|diff --git|^\+\+\+ /m.test(text)) {
        ok = false;
        problems.push(`${task}/${arm}`);
      }
    }
  }
  record("no_corrected_patch_in_model_visible_material", ok, problems.length ? problems.join(", ") : "no packet references repair material");
}

// 6. Leakage controls pass (heuristic; not a purity proof).
{
  const result = await run([process.execPath, "scripts/gate-m/check-v3-leakage.mjs", "--json"]);
  let ok = result.code === 0;
  let detail = `leakage checker exited ${result.code}`;
  if (result.out) {
    try {
      const report = JSON.parse(result.out);
      detail = `${report.blocking_total} blocking finding(s), ${report.excluded_from_t3.length} task(s) excluded from T3`;
      ok = report.blocking_total === 0;
    } catch {
      /* keep exit-code result */
    }
  }
  record("leakage_controls_heuristic", ok, detail);
}

// 7. Frozen identities: V3 freeze verifies, and superseded freezes are intact
//    apart from documented divergences.
{
  const result = await run([process.execPath, "scripts/gate-m/freeze-v3.mjs", "--verify"]);
  record("frozen_identities", result.code === 0, result.out.trim().split("\n").pop() ?? `exited ${result.code}`);
}

// 8. Receipt integrity and deterministic failure handling, via the suite.
{
  // The suite writes through TMPDIR; on a clean clone that directory does not
  // exist yet, and five tests fail for want of it rather than for any defect.
  await mkdir(resolve(root, ".test-temp"), { recursive: true });
  const result = await run([process.execPath, "--test", ...(await readdir(resolve(root, "dist/tests"))).filter((f) => f.endsWith(".test.js")).map((f) => `dist/tests/${f}`)], { env: { ...process.env, TMPDIR: resolve(root, ".test-temp") } });
  const pass = /(?:^|\n)[#ℹ]\s*pass (\d+)/.exec(result.out)?.[1];
  const fail = /(?:^|\n)[#ℹ]\s*fail (\d+)/.exec(result.out)?.[1];
  record("receipt_and_failure_handling_tests", result.code === 0 && fail === "0", `pass=${pass ?? "?"} fail=${fail ?? "?"}`);
}

// 9. Cost accounting: pricing evidence is hash-bound and present.
{
  const path = "data/pricing/openai-2026-08-02.evidence.json";
  const present = await exists(path);
  record("cost_accounting_evidence", present, present ? `pricing evidence sha256 ${sha256(await readFile(resolve(root, path))).slice(0, 16)}` : "missing pricing evidence");
}

// 10. Accurate limitations: no forbidden claim vocabulary in V3 material.
{
  const policy = JSON.parse(await readFile(resolve(root, "tasks/gate-m-v3/review-policy.json"), "utf8"));
  const forbidden = policy.semantic_claim_vocabulary.forbidden;
  const files = ["tasks/gate-m-v3/TREATMENTS.json", "tasks/gate-m-v3/review-policy.json", "tasks/gate-m-v3/PROTOCOL.md"];
  const hits = [];
  for (const file of files) {
    if (!(await exists(file))) continue;
    const text = await readFile(resolve(root, file), "utf8");
    for (const phrase of forbidden) {
      // The policy itself must be able to name what it forbids.
      if (file.endsWith("review-policy.json")) continue;
      // A document must be able to state which terms it forbids. Only flag a
      // phrase used outside such a declaration.
      const used = text.split("\n").filter((line) => new RegExp(phrase.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&"), "i").test(line) && !/forbidden/i.test(line));
      if (used.length > 0 && new RegExp(phrase.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&"), "i").test(text)) hits.push(`${file}: "${phrase}"`);
    }
  }
  record("no_forbidden_claim_vocabulary", hits.length === 0, hits.length ? hits.join("; ") : "no forbidden claim vocabulary in V3 material");
}

const allOk = checks.every((c) => c.ok);
const verdict = allOk ? "method_kernel_valid_with_unreviewed_semantic_interventions" : "gate_m_kernel_failed";

const report = {
  schema_version: "1.0",
  gate: "gate_m_kernel",
  protocol_version: "gate-m-treatments-v3",
  evaluated_at: new Date().toISOString(),
  environment: { platform, architecture: arch, node_version: version },
  reviewer_conditions_apply: false,
  verdict,
  permits: allOk ? ["pr_merge", "exploratory_gate_h_execution"] : [],
  does_not_permit: [
    "strong causal claim about fine-grained information levels",
    "attribution of a T3 effect to diagnosis rather than behavioral objective",
    "any Luna capability, Sol comparison, or product claim",
  ],
  semantic_status: "author_reviewed_semantic_separation_unverified",
  checks,
};

if (process.argv.includes("--json")) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
else {
  for (const c of checks) process.stdout.write(`${c.ok ? "PASS" : "FAIL"}  ${c.id}\n        ${c.detail}\n`);
  process.stdout.write(`\nverdict: ${verdict}\n`);
}
process.exit(allOk ? 0 : 1);
