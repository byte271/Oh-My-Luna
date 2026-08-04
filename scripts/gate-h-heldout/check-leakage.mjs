// Mechanical leakage controls for the held-out T1-T3 packets and visible issues.
//
// Same posture as the Gate M checks: these are heuristics over wording and
// token overlap. They cannot establish semantic purity and are never reported
// as if they do. A packet that passes is still
// author_reviewed_semantic_separation_unverified.
//
// On a blocking finding the arm-task packet is EXCLUDED, not reworded until it
// passes. Rewriting to defeat a detector fits the corpus to the detector.
//
// Usage: node scripts/gate-h-heldout/check-leakage.mjs [--json]

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawn } from "node:child_process";

const root = resolve(new URL("../..", import.meta.url).pathname);
const cache = resolve(root, ".gate-h-heldout-cache");

const SIMILARITY_EXCLUSION_THRESHOLD = 0.5;

const EDIT_INSTRUCTION_PATTERNS = [
  /\breplace\s+.{0,60}?\bwith\b/i,
  /\bchange\s+line\s+\d+/i,
  /\bon\s+line\s+\d+\b/i,
  /\badd\s+(?:a\s+)?(?:new\s+)?(?:line|statement|parameter|field|flag|property)\b/i,
  /\binsert\s+(?:a\s+|the\s+)?\S+\s+(?:before|after|into)\b/i,
  /\bset\s+\S+\s*=\s*\S+/,
  /\bwrap\s+\S+\s+in\b/i,
  /\bdelete\s+the\b/i,
  /\bcall\s+\S+\(\)\s+on\b/i
];

const identifiers = (t) => new Set(t.match(/[A-Za-z_$][A-Za-z0-9_$]{2,}/g) ?? []);
const tokens = (t) => (t.toLowerCase().match(/[a-z0-9_$]{3,}/g) ?? []);

function stripComments(lines) {
  const out = [];
  let inBlock = false;
  for (const raw of lines) {
    let line = raw;
    if (inBlock) {
      const end = line.indexOf("*/");
      if (end === -1) continue;
      line = line.slice(end + 2);
      inBlock = false;
    }
    for (;;) {
      const s = line.indexOf("/*");
      if (s === -1) break;
      const e = line.indexOf("*/", s + 2);
      if (e === -1) {
        line = line.slice(0, s);
        inBlock = true;
        break;
      }
      line = line.slice(0, s) + line.slice(e + 2);
    }
    line = line.replace(/\/\/.*$/, "").replace(/#.*$/, "");
    if (/^\s*\*/.test(line)) continue;
    if (line.trim()) out.push(line);
  }
  return out;
}

function jaccard(a, b) {
  const A = new Set(a);
  const B = new Set(b);
  if (!A.size || !B.size) return 0;
  let shared = 0;
  for (const t of A) if (B.has(t)) shared += 1;
  return shared / (A.size + B.size - shared);
}

function payloadText(payload) {
  const out = [];
  const walk = (n) => {
    if (typeof n === "string") out.push(n);
    else if (Array.isArray(n)) n.forEach(walk);
    else if (n && typeof n === "object") Object.values(n).forEach(walk);
  };
  walk(payload);
  return out;
}

function git(args) {
  return new Promise((res) => {
    const c = spawn("git", args, { cwd: root, shell: false, stdio: ["ignore", "pipe", "ignore"] });
    let out = "";
    c.stdout.on("data", (d) => (out += d));
    c.on("error", () => res(""));
    c.on("close", () => res(out));
  });
}

const corpus = JSON.parse(await readFile(resolve(root, "tasks/gate-h-heldout/selected-corpus.json"), "utf8"));
const report = {
  schema_version: "1.0",
  threshold: SIMILARITY_EXCLUSION_THRESHOLD,
  is_heuristic: true,
  not_a_purity_proof: true,
  excluded: [],
  packets: []
};

for (const task of corpus.tasks) {
  const bare = resolve(cache, "repos", task.repository_name, ".git");
  const diff = await git(["-C", bare, "show", "--format=", task.corrected_commit, "--", ...task.source_files]);
  const subject = (await git(["-C", bare, "log", "-1", "--format=%s%n%b", task.corrected_commit])).trim();

  const added = diff.split("\n").filter((l) => l.startsWith("+") && !l.startsWith("+++")).map((l) => l.slice(1).trim()).filter(Boolean);
  const removed = diff.split("\n").filter((l) => l.startsWith("-") && !l.startsWith("---")).map((l) => l.slice(1).trim()).filter(Boolean);
  const patchTokens = tokens(added.join(" "));

  const baseIds = new Set();
  for (const file of task.source_files) {
    const content = await git(["-C", bare, "show", `${task.base_commit}:${file}`]);
    for (const id of identifiers(content)) baseIds.add(id);
  }
  const correctedOnly = new Set([...identifiers(stripComments(added).join("\n"))].filter((id) => !baseIds.has(id)));

  // The visible issue is checked too: it reaches every arm including T0.
  const issue = await readFile(resolve(root, "tasks/gate-h-heldout/tasks", task.task_id, "visible", "issue.md"), "utf8");

  for (const arm of ["T0", "T1", "T2", "T3"]) {
    let strings = [issue];
    if (arm !== "T0") {
      const packet = JSON.parse(await readFile(resolve(root, "tasks/gate-h-heldout/tasks", task.task_id, "arms", `${arm}.json`), "utf8"));
      strings = strings.concat(payloadText(packet.payload));
    }
    const text = strings.join("\n");
    const findings = [];

    for (const line of added) {
      if (line.length >= 12 && text.includes(line)) findings.push({ severity: "blocking", check: "exact_patch_text", detail: line.slice(0, 120) });
    }
    for (const line of removed) {
      if (line.length >= 12 && text.includes(line)) findings.push({ severity: "blocking", check: "replacement_expression", detail: line.slice(0, 120) });
    }
    for (const id of correctedOnly) {
      if (new RegExp(`\\b${id.replace(/[$]/g, "\\$")}\\b`).test(text)) {
        findings.push({ severity: "blocking", check: "corrected_version_only_identifier", detail: id });
      }
    }
    for (const p of EDIT_INSTRUCTION_PATTERNS) {
      const hit = strings.find((s) => p.test(s));
      if (hit) findings.push({ severity: "blocking", check: "edit_instruction", detail: hit.slice(0, 140) });
    }
    if (text.includes(task.corrected_commit) || text.includes(task.corrected_commit.slice(0, 8))) {
      findings.push({ severity: "blocking", check: "corrected_commit_reference", detail: task.corrected_commit });
    }
    // The upstream commit message often names the repair directly.
    const subjectLine = subject.split("\n")[0];
    if (subjectLine.length > 15 && text.includes(subjectLine)) {
      findings.push({ severity: "blocking", check: "copied_commit_message", detail: subjectLine.slice(0, 120) });
    }
    for (const testFile of task.evaluator_test_files) {
      if (text.includes(testFile)) findings.push({ severity: "blocking", check: "evaluator_only_path", detail: testFile });
    }

    const similarity = jaccard(tokens(text), patchTokens);
    if (arm === "T3" && similarity > SIMILARITY_EXCLUSION_THRESHOLD) {
      findings.push({ severity: "blocking", check: "similarity_above_exclusion_threshold", detail: `${similarity.toFixed(3)} > ${SIMILARITY_EXCLUSION_THRESHOLD}` });
    }

    const blocking = findings.filter((f) => f.severity === "blocking");
    if (blocking.length) report.excluded.push({ task_id: task.task_id, treatment_id: arm });
    report.packets.push({
      task_id: task.task_id,
      treatment_id: arm,
      similarity_to_known_repair: Number(similarity.toFixed(4)),
      blocking_count: blocking.length,
      findings
    });
  }
}

report.blocking_total = report.packets.reduce((n, p) => n + p.blocking_count, 0);
report.summary =
  report.blocking_total === 0
    ? "No blocking heuristic finding. This is not evidence of semantic purity."
    : `${report.blocking_total} blocking finding(s); ${report.excluded.length} arm-task packet(s) excluded.`;

const text = `${JSON.stringify(report, null, 2)}\n`;
if (process.argv.includes("--json")) process.stdout.write(text);
else {
  await writeFile(resolve(root, "tasks/gate-h-heldout/leakage-report.json"), text);
  for (const p of report.packets) {
    process.stdout.write(`${p.task_id} ${p.treatment_id}: similarity=${p.similarity_to_known_repair} blocking=${p.blocking_count}\n`);
    for (const f of p.findings) process.stdout.write(`    [${f.severity}] ${f.check}: ${f.detail}\n`);
  }
  process.stdout.write(`\n${report.summary}\n`);
}
process.exit(report.blocking_total === 0 ? 0 : 1);
