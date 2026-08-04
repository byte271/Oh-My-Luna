// Mechanical leakage controls for the V3 treatment packets.
//
// These replace nothing. With independent semantic review removed from the
// project, there is no longer any process that can establish semantic purity,
// and these checks must not be described as if they do. They are heuristics
// over wording and token overlap. A packet that passes every check here is
// still `author_reviewed_semantic_separation_unverified`.
//
// What they do catch, conservatively:
//   - exact patch text copied into a packet
//   - identifiers that exist only in the corrected version
//   - line-by-line edit instructions and replacement expressions
//   - references to the corrected commit, or its commit message
//   - evaluator-only details
//   - a missing multiple-implementations justification on T3
//   - high token similarity to the known repair
//
// Policy on failure: if a T3 packet is too close to the correction, the task is
// EXCLUDED from T3. It is not reworded until it passes. Repeated rewriting to
// clear a similarity threshold is how a corpus gets quietly fitted to its own
// leakage detector.
//
// Usage: node scripts/gate-m/check-v3-leakage.mjs [--json]

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(new URL("../..", import.meta.url).pathname);
const v3 = resolve(root, "tasks/gate-m-v3");

const TASKS = {
  "zod-tuple-default": { patch: "tasks/gate-m/zod-tuple-default/control/known-repair.patch", worktree: "zod-tuple-base", corrected: "b6066b3e4730fc8b966d13974b4abae8dce25df4" },
  "zod-absent-catch": { patch: "tasks/gate-m/zod-absent-catch/control/known-repair.patch", worktree: "zod-catch-base", corrected: "1cab69383fcdeae2a366d5e2a2fc4d8fc765d168" },
  "date-fns-zh-month": { patch: "tasks/gate-m/date-fns-zh-month/control/known-repair.patch", worktree: "date-fns-base", corrected: "b9c5865edb7610c59e6b3694ed1e1691f4807688" },
  "type-fest-conditional-keys": { patch: "tasks/gate-m/type-fest-conditional-keys/control/known-repair.patch", worktree: "type-fest-base", corrected: "0fb2d62f7d222d3effb0ad89d5b340e36285bcc4" },
};

// Similarity above this excludes the task from T3. Registered here, before the
// numbers were known, and not to be raised to make a task fit.
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
];

const identifiers = (text) => new Set((text.match(/[A-Za-z_$][A-Za-z0-9_$]{2,}/g) ?? []));
const tokens = (text) => (text.toLowerCase().match(/[a-z0-9_$]{3,}/g) ?? []);

// Comments in a repair patch are English prose. Treating their words as code
// identifiers produces false positives on ordinary packet wording ("explicit",
// "preserved", "parser"), so comments are removed before identifier analysis.
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
      const start = line.indexOf("/*");
      if (start === -1) break;
      const end = line.indexOf("*/", start + 2);
      if (end === -1) {
        line = line.slice(0, start);
        inBlock = true;
        break;
      }
      line = line.slice(0, start) + line.slice(end + 2);
    }
    line = line.replace(/\/\/.*$/, "");
    if (/^\s*\*/.test(line)) continue;
    if (line.trim().length > 0) out.push(line);
  }
  return out;
}

function jaccard(a, b) {
  const A = new Set(a);
  const B = new Set(b);
  if (A.size === 0 || B.size === 0) return 0;
  let shared = 0;
  for (const t of A) if (B.has(t)) shared += 1;
  return shared / (A.size + B.size - shared);
}

// Every human-readable string in a packet payload.
function payloadText(payload) {
  const out = [];
  const walk = (node) => {
    if (typeof node === "string") out.push(node);
    else if (Array.isArray(node)) node.forEach(walk);
    else if (node && typeof node === "object") Object.values(node).forEach(walk);
  };
  walk(payload);
  return out;
}

// No timestamp: the report is a freeze-bound artifact, so its bytes must be a
// pure function of the corpus. A generated_at field would change the hash on
// every run and make the freeze impossible to verify.
const report = { schema_version: "1.0", threshold: SIMILARITY_EXCLUSION_THRESHOLD, is_heuristic: true, not_a_purity_proof: true, findings: [], excluded_from_t3: [], packets: [] };

for (const [task, spec] of Object.entries(TASKS)) {
  const patch = await readFile(resolve(root, spec.patch), "utf8");
  const addedLines = patch.split("\n").filter((l) => l.startsWith("+") && !l.startsWith("+++")).map((l) => l.slice(1).trim()).filter((l) => l.length > 0);
  const removedLines = patch.split("\n").filter((l) => l.startsWith("-") && !l.startsWith("---")).map((l) => l.slice(1).trim());
  const patchTokens = tokens(addedLines.join(" "));

  // Identifiers introduced by the repair: present in added lines, absent from
  // the base file the patch applies to.
  const baseFiles = [...patch.matchAll(/^--- a\/(.+)$/gm)].map((m) => m[1]);
  const baseIdentifiers = new Set();
  for (const file of baseFiles) {
    try {
      const content = await readFile(resolve(root, ".gate-m-cache/worktrees", spec.worktree, file), "utf8");
      for (const id of identifiers(content)) baseIdentifiers.add(id);
    } catch {
      report.findings.push({ task_id: task, severity: "warning", check: "base_file_unavailable", detail: `${file} not present; run gate-m:provision for full identifier analysis` });
    }
  }
  const addedCode = stripComments(addedLines);
  const correctedOnly = new Set([...identifiers(addedCode.join("\n"))].filter((id) => !baseIdentifiers.has(id)));

  for (const treatment of ["T1", "T2", "T3"]) {
    const packet = JSON.parse(await readFile(resolve(v3, task, "treatments", `${treatment}.json`), "utf8"));
    const strings = payloadText(packet.payload);
    const text = strings.join("\n");
    const findings = [];

    for (const line of addedLines) {
      if (line.length >= 12 && text.includes(line)) findings.push({ severity: "blocking", check: "exact_patch_text", detail: line.slice(0, 120) });
    }
    for (const id of correctedOnly) {
      if (new RegExp(`\\b${id.replace(/[$]/g, "\\$")}\\b`).test(text)) {
        findings.push({ severity: "blocking", check: "corrected_version_only_identifier", detail: id });
      }
    }
    for (const pattern of EDIT_INSTRUCTION_PATTERNS) {
      const hit = strings.find((s) => pattern.test(s));
      if (hit) findings.push({ severity: "blocking", check: "edit_instruction", detail: hit.slice(0, 140) });
    }
    if (text.includes(spec.corrected) || text.includes(spec.corrected.slice(0, 8))) {
      findings.push({ severity: "blocking", check: "corrected_commit_reference", detail: spec.corrected });
    }
    if (/verify\.mjs|control\/evaluator|exit\s*(?:code\s*)?17\b|known-repair/i.test(text)) {
      findings.push({ severity: "blocking", check: "evaluator_only_detail", detail: "packet references evaluator-only material" });
    }
    // Replacement expressions: a removed line's code paired with its added form.
    for (const removed of removedLines) {
      if (removed.length >= 12 && text.includes(removed)) findings.push({ severity: "blocking", check: "replacement_expression", detail: removed.slice(0, 120) });
    }

    const similarity = jaccard(tokens(text), patchTokens);

    if (treatment === "T3") {
      const bo = packet.payload.behavioral_objective;
      if (!bo?.multiple_implementations_possible || !bo?.multiple_implementations_justification) {
        findings.push({ severity: "blocking", check: "missing_multiple_implementations_statement", detail: "T3 requires an explicit justification that two materially different implementations could satisfy the objective" });
      }
      if (similarity > SIMILARITY_EXCLUSION_THRESHOLD) {
        findings.push({ severity: "blocking", check: "similarity_above_exclusion_threshold", detail: `${similarity.toFixed(3)} > ${SIMILARITY_EXCLUSION_THRESHOLD}` });
      }
    }

    const blocking = findings.filter((f) => f.severity === "blocking");
    if (treatment === "T3" && blocking.length > 0 && !report.excluded_from_t3.includes(task)) report.excluded_from_t3.push(task);

    report.packets.push({ task_id: task, treatment_id: treatment, similarity_to_known_repair: Number(similarity.toFixed(4)), finding_count: findings.length, blocking_count: blocking.length, findings });
    report.findings.push(...findings.map((f) => ({ task_id: task, treatment_id: treatment, ...f })));
  }
}

report.blocking_total = report.packets.reduce((n, p) => n + p.blocking_count, 0);
report.summary = report.blocking_total === 0
  ? "No blocking heuristic finding. This is not evidence of semantic purity."
  : `${report.blocking_total} blocking finding(s); ${report.excluded_from_t3.length} task(s) excluded from T3.`;

const out = `${JSON.stringify(report, null, 2)}\n`;

// --json is the read-only mode used by the kernel validator; it must not write
// to a freeze-bound artifact while the freeze is being checked.
if (process.argv.includes("--json")) {
  process.stdout.write(out);
} else {
  await writeFile(resolve(v3, "leakage-report.json"), out);
  for (const p of report.packets) {
    process.stdout.write(`${p.task_id} ${p.treatment_id}: similarity=${p.similarity_to_known_repair} blocking=${p.blocking_count}\n`);
    for (const f of p.findings) process.stdout.write(`    [${f.severity}] ${f.check}: ${f.detail}\n`);
  }
  process.stdout.write(`\n${report.summary}\n`);
}
process.exit(report.blocking_total === 0 ? 0 : 1);
