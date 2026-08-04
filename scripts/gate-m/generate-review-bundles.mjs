import { createHash } from "node:crypto";
import { access, cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const root = resolve(new URL("../..", import.meta.url).pathname);
const seed = "gate-m-review-order/271";
const tasks = [
  { id: "zod-tuple-default", baseWorkspace: "zod-tuple-base" },
  { id: "zod-absent-catch", baseWorkspace: "zod-catch-base" },
  { id: "date-fns-zh-month", baseWorkspace: "date-fns-base" },
  { id: "type-fest-conditional-keys", baseWorkspace: "type-fest-base" }
];
const levels = ["L1_context", "L2_localization", "L3_observation", "L4_diagnosis", "L5_plan"];
const exportRoot = resolve(root, "tasks/gate-m/review-export/bundles");
try {
  await access(exportRoot);
  throw new Error(
    `Review export already exists at ${exportRoot}; refusing to overwrite material that may contain reviewer work. Use a new frozen review schedule instead.`,
  );
} catch (error) {
  if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) {
    throw error;
  }
}
await mkdir(exportRoot, { recursive: true });

const entries = [];
for (const task of tasks) {
  const taskRoot = resolve(root, "tasks/gate-m", task.id);
  const issue = await readFile(resolve(taskRoot, "visible/issue.md"), "utf8");
  const repair = await readFile(resolve(taskRoot, "control/known-repair.patch"));
  for (const level of levels) {
    const draftPath = resolve(taskRoot, "interventions", `${level.slice(0, 2)}.json`);
    const draft = JSON.parse(await readFile(draftPath, "utf8"));
    const opaqueId = `gm-${sha256(`${seed}|${task.id}|${level}`).slice(0, 16)}`;
    const renderedExcerpt = await sourceExcerpt(task.baseWorkspace, draft.payload.context.regions);
    const bundleRoot = resolve(exportRoot, opaqueId);
    await mkdir(bundleRoot, { recursive: true });
    const bundle = {
      schema_version: "0.1",
      opaque_packet_id: opaqueId,
      rubric_version: "oracle-boundary/1.0.0",
      target_level_disclosed: false,
      previous_reviews_included: false,
      issue,
      base_state_source_excerpt: renderedExcerpt,
      packet_under_review: { schema_version: "0.1", design: draft.design, payload: draft.payload },
      reviewer_material: { repair_comparison_file: "repair-comparison.patch", answer_file: "answer-template.json" }
    };
    await writeFile(resolve(bundleRoot, "bundle.json"), `${JSON.stringify(bundle, null, 2)}\n`, "utf8");
    await cp(resolve(taskRoot, "control/known-repair.patch"), resolve(bundleRoot, "repair-comparison.patch"));
    const answer = {
      schema_version: "0.1",
      opaque_packet_id: opaqueId,
      reviewer_id: null,
      reviewer_class: null,
      reviewed_at: null,
      actual_level: null,
      later_level_information_present: null,
      implementation_or_patch_disclosed: null,
      base_unavailable_identifier_present: null,
      suspicious_repair_similarity: null,
      allowed_category_sufficient: null,
      sentence_level_comments: [],
      unnecessary_sentences: [],
      decision: null,
      decision_options: ["approve", "revise", "reject", "collapse_levels"]
    };
    await writeFile(resolve(bundleRoot, "answer-template.json"), `${JSON.stringify(answer, null, 2)}\n`, "utf8");
    entries.push({
      opaque_packet_id: opaqueId,
      task_id: task.id,
      target_level: level,
      draft_file_sha256: sha256(await readFile(draftPath)),
      draft_content_sha256: draft.provenance.content_sha256,
      bundle_sha256: sha256(await readFile(resolve(bundleRoot, "bundle.json"))),
      repair_comparison_sha256: sha256(repair)
    });
  }
}

entries.sort((a, b) => sha256(`${seed}|${a.opaque_packet_id}`).localeCompare(sha256(`${seed}|${b.opaque_packet_id}`)));
const schedule = {
  schema_version: "0.1",
  schedule_id: "gate-m-blinded-review-2026-08-02-v1",
  seed_sha256: sha256(seed),
  target_labels_controller_only: true,
  entries: entries.map((entry, index) => ({ order: index + 1, ...entry }))
};
const schedulePath = resolve(root, "tasks/gate-m/review-control/schedule.json");
await mkdir(dirname(schedulePath), { recursive: true });
await writeFile(schedulePath, `${JSON.stringify(schedule, null, 2)}\n`, "utf8");

async function sourceExcerpt(worktree, regions) {
  const blocks = [];
  for (const region of regions) {
    const path = resolve(root, ".gate-m-cache/worktrees", worktree, region.path);
    const lines = (await readFile(path, "utf8")).split("\n");
    const selected = lines.slice(region.start_line - 1, region.end_line)
      .map((line, index) => `${String(region.start_line + index).padStart(6, " ")}\t${line}`)
      .join("\n");
    blocks.push(`FILE ${region.path}\nLINES ${region.start_line}-${region.end_line}\n${selected}`);
  }
  return blocks.join("\n\n");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
