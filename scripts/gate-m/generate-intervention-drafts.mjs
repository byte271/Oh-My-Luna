import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const root = resolve(new URL("../..", import.meta.url).pathname);
const taskIds = ["zod-tuple-default", "zod-absent-catch", "date-fns-zh-month", "type-fest-conditional-keys"];
const levelComponents = {
  L1_context: ["context"],
  L2_localization: ["context", "localization"],
  L3_observation: ["context", "localization", "observation"],
  L4_diagnosis: ["context", "localization", "observation", "diagnosis"],
  L5_plan: ["context", "localization", "observation", "diagnosis", "plan"]
};

for (const taskId of taskIds) {
  const taskRoot = resolve(root, "tasks/gate-m", taskId);
  const source = JSON.parse(await readFile(resolve(taskRoot, "intervention-authoring.json"), "utf8"));
  const authored = [];
  for (const [level, names] of Object.entries(levelComponents)) {
    const payload = Object.fromEntries(names.map((name) => [name, source.components[name]]));
    const keys = new Set(names);
    const draft = {
      schema_version: "0.1",
      task_id: taskId,
      task_base_commit: source.base_commit,
      intervention_level: level,
      design: "cumulative",
      payload,
      source: {
        kind: "model_authored_unreviewed",
        evidence_refs: source.evidence_refs[level],
        fixed_commit_accessible_to_agent: false,
        facts_visible_from_base: !["L4_diagnosis", "L5_plan"].includes(level)
      },
      information_boundary: {
        allowed_categories: names,
        forbidden_categories: ["patch_text", "fixed_commit", "hidden_evaluator", "implementation_instruction", ...Object.keys(levelComponents).slice(names.length)],
        contains_diagnosis: keys.has("diagnosis"),
        contains_plan: keys.has("plan"),
        contains_code_location: true,
        contains_exact_identifier: keys.has("localization") || keys.has("observation"),
        contains_patch_text: false
      },
      review_status: "pending_independent_review",
      provenance: {
        author_id: "codex-sol-primary-2026-08-02",
        author_class: "model_assisted_primary_author",
        created_at: "2026-08-02T06:30:00Z",
        rubric_version: "oracle-boundary/1.0.0",
        revision: 1,
        content_sha256: "0".repeat(64)
      }
    };
    draft.provenance.content_sha256 = contentHash(draft);
    const path = resolve(taskRoot, "interventions", `${level.slice(0, 2)}.json`);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `${JSON.stringify(draft, null, 2)}\n`, "utf8");
    authored.push({ level, path: `interventions/${level.slice(0, 2)}.json`, content_sha256: draft.provenance.content_sha256 });
  }
  const authorRecord = {
    schema_version: "0.1",
    task_id: taskId,
    author_id: "codex-sol-primary-2026-08-02",
    author_class: "model_assisted_primary_author",
    authored_at: "2026-08-02T06:30:00Z",
    fixed_repair_was_available_to_author: true,
    independent_reviewer: false,
    rubric_version: "oracle-boundary/1.0.0",
    drafts: authored,
    limitations: ["The author inspected the historical repair while constructing the task; independent leakage review is mandatory before scheduling."]
  };
  const authorPath = resolve(taskRoot, "reviews/author-record.json");
  await mkdir(dirname(authorPath), { recursive: true });
  await writeFile(authorPath, `${JSON.stringify(authorRecord, null, 2)}\n`, "utf8");
}

function contentHash(draft) {
  const clone = structuredClone(draft);
  delete clone.provenance.content_sha256;
  return createHash("sha256").update(canonicalJson(clone)).digest("hex");
}

function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}
