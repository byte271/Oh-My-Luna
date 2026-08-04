import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { loadInterventionDraft, materializeDraftForReview } from "../src/intervention-drafts.js";
import { validateTaskManifest, validateTaskPool } from "../src/schema.js";
import type { TaskPoolManifest } from "../src/types.js";

const TASKS = [
  { id: "zod-tuple-default", base: "ec979ad783a9e9c992d3c9bd4e5f3b56110b1ef8", fixedOnly: ["handleTupleResults", "itemResults"], baseIds: ["$ZodTuple", "handleTupleResult"] },
  { id: "zod-absent-catch", base: "b8dffe9e62f17e6571e6249d05cc5102b54d94e4", fixedOnly: ["caught"], baseIds: ["handleOptionalResult", "$ZodOptional", "$ZodCatch"] },
  { id: "date-fns-zh-month", base: "39d1e14200cead9e4be5df88695b5e82082875ed", fixedOnly: [], baseIds: ["matchMonthPatterns", "parseMonthPatterns"] },
  { id: "type-fest-conditional-keys", base: "b6d8dd60726a8d7df5a5eea3b3c9d830804d2570", fixedOnly: [], baseIds: ["ConditionalKeys", "mapped property selection", "indexed key union"] }
] as const;
const LEVELS = ["L1_context", "L2_localization", "L3_observation", "L4_diagnosis", "L5_plan"] as const;

test("Gate M corpus has four accepted real tasks across three repositories", async () => {
  const pool = await validateTaskPool(JSON.parse(await readFile(resolve("tasks/gate-m/candidate-pool.json"), "utf8"))) as TaskPoolManifest;
  const included = pool.candidates.filter((candidate) => candidate.selection.status === "included");
  assert.equal(included.length, 4);
  assert.equal(new Set(included.map((candidate) => `${candidate.repository.organization}/${candidate.repository.name}`)).size, 3);
  assert.ok(included.every((candidate) => candidate.language === "typescript"));
  assert.ok(pool.candidates.filter((candidate) => candidate.selection.status === "excluded").every((candidate) => candidate.selection.exclusion_reason));
});

test("real task manifests bind source archives and hidden evaluators", async () => {
  for (const task of TASKS) {
    const manifestPath = resolve("tasks/gate-m", task.id, "manifest.json");
    const manifest = await validateTaskManifest(JSON.parse(await readFile(manifestPath, "utf8")));
    assert.equal(manifest.repository.base_commit, task.base);
    const evaluator = await readFile(resolve("tasks/gate-m", task.id, "control/evaluator/verify.mjs"));
    assert.equal(manifest.hashes.hidden_verifier_sha256, sha256(evaluator));
    assert.ok(manifest.boundaries.hidden_paths.includes("control"));
  }
});

test("all twenty real-task drafts validate, remain pending, and materialize without a level label", async () => {
  let count = 0;
  for (const task of TASKS) {
    const patchText = await readFile(resolve("tasks/gate-m", task.id, "control/known-repair.patch"), "utf8");
    for (const level of LEVELS) {
      const loaded = await loadInterventionDraft({
        path: resolve("tasks/gate-m", task.id, "interventions", `${level.slice(0, 2)}.json`),
        expectedTaskId: task.id,
        expectedBaseCommit: task.base,
        expectedLevel: level,
        oracleMaterial: {
          hiddenPaths: ["control", "reviews", "freeze"],
          fixedPatchText: patchText,
          fixedOnlyIdentifiers: [...task.fixedOnly],
          baseIdentifiers: [...task.baseIds]
        }
      });
      assert.equal(loaded.draft.review_status, "pending_independent_review");
      assert.equal(loaded.draft.source.kind, "model_authored_unreviewed");
      const materialized = materializeDraftForReview(loaded);
      assert.equal(JSON.stringify(materialized).includes(level), false);
      count++;
    }
  }
  assert.equal(count, 20);
});

test("model-visible bundles omit corrected commit identities and control material", async () => {
  for (const task of TASKS) {
    const manifest = JSON.parse(await readFile(resolve("tasks/gate-m", task.id, "manifest.json"), "utf8")) as { repository: { fixed_commit: string } };
    for (const visible of ["visible/issue.md", "visible/public-test-information.json"]) {
      const content = await readFile(resolve("tasks/gate-m", task.id, visible), "utf8");
      assert.equal(content.includes(manifest.repository.fixed_commit), false);
      assert.equal(/known-repair|control\/evaluator|hidden[_ -]verifier/iu.test(content), false);
    }
  }
});

test("twenty blinded review bundles omit target labels and previous decisions", async () => {
  const schedule = JSON.parse(await readFile(resolve("tasks/gate-m/review-control/schedule.json"), "utf8")) as {
    entries: Array<{ opaque_packet_id: string; target_level: string; bundle_sha256: string }>;
  };
  assert.equal(schedule.entries.length, 20);
  assert.equal(new Set(schedule.entries.map((entry) => entry.opaque_packet_id)).size, 20);
  for (const entry of schedule.entries) {
    const bundleBytes = await readFile(resolve("tasks/gate-m/review-export/bundles", entry.opaque_packet_id, "bundle.json"));
    const bundleText = bundleBytes.toString("utf8");
    const bundle = JSON.parse(bundleText) as { target_level_disclosed: boolean; previous_reviews_included: boolean };
    assert.equal(sha256(bundleBytes), entry.bundle_sha256);
    assert.equal(bundle.target_level_disclosed, false);
    assert.equal(bundle.previous_reviews_included, false);
    assert.equal(bundleText.includes(entry.target_level), false);
    const answer = JSON.parse(await readFile(resolve("tasks/gate-m/review-export/bundles", entry.opaque_packet_id, "answer-template.json"), "utf8")) as { reviewer_id: null; actual_level: null; decision: null };
    assert.equal(answer.reviewer_id, null);
    assert.equal(answer.actual_level, null);
    assert.equal(answer.decision, null);
  }
});

test("review policy requires two independent reviewers and agreement remains honestly pending", async () => {
  const policy = JSON.parse(await readFile(resolve("tasks/gate-m/review-control/policy.json"), "utf8")) as { required_distinct_reviewers: number; author_may_review: boolean; collapse_rule: { exact_agreement_threshold: number; registered_before_reviews: boolean } };
  const agreement = JSON.parse(await readFile(resolve("tasks/gate-m/review-control/agreement.json"), "utf8")) as { status: string; reviewer_count: number; exact_level_agreement: null; l3_l4_collapse_decision: string };
  assert.equal(policy.required_distinct_reviewers, 2);
  assert.equal(policy.author_may_review, false);
  assert.equal(policy.collapse_rule.exact_agreement_threshold, 0.8);
  assert.equal(policy.collapse_rule.registered_before_reviews, true);
  assert.equal(agreement.status, "pending_external_independent_review");
  assert.equal(agreement.reviewer_count, 0);
  assert.equal(agreement.exact_level_agreement, null);
  assert.equal(agreement.l3_l4_collapse_decision, "pending");
});

function sha256(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}
