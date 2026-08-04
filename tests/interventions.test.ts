import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { interventionContentHash, loadIntervention, materializeAssistance } from "../src/interventions.js";
import { OmlError } from "../src/errors.js";
import type { InterventionDesign, InterventionLevel, InterventionPacket, InterventionPayload, InterventionReview } from "../src/types.js";

const SHA = "0".repeat(64);

function componentsThrough(level: InterventionLevel): InterventionPayload {
  const payload: InterventionPayload = {};
  if (level === "verification_gap") {
    payload.verification_gap = { unproven_behavior: "Cancellation isolation remains unproven.", required_evidence_categories: ["behavioral_test"] };
    return payload;
  }
  payload.context = { regions: [{ path: "src/state.ts", start_line: 10, end_line: 40 }] };
  if (level === "L1_context") return payload;
  payload.localization = {
    symbols: [
      { path: "src/state.ts", name: "scheduleCallback", kind: "function" },
      { path: "src/state.ts", name: "handleResult", kind: "function" }
    ],
    failing_boundary: { producer_symbol: "scheduleCallback", consumer_symbol: "handleResult", type: "async_callback" }
  };
  if (level === "L2_localization") return payload;
  payload.observation = {
    facts: [{ statement: "After cancellation, callback X executes with generation=4 while active generation is 5.", evidence_refs: ["trace:1"], certainty: "observed" }]
  };
  if (level === "L3_observation") return payload;
  payload.diagnosis = {
    root_cause: "Callbacks created for an earlier generation remain authorized to mutate the current generation.",
    supporting_evidence_refs: ["trace:1"],
    certainty: "confirmed"
  };
  if (level === "L4_diagnosis") return payload;
  payload.plan = {
    behavioral_objective: "Prevent stale-generation callbacks from mutating current state while preserving active-generation callbacks.",
    constraints: ["Do not suppress callbacks from the active generation."],
    non_goals: ["Do not redesign callback scheduling."]
  };
  return payload;
}

function packetFor(level: InterventionLevel = "L3_observation", design: InterventionDesign = "cumulative"): InterventionPacket {
  const cumulative = componentsThrough(level);
  const key = ({
    L1_context: "context", L2_localization: "localization", L3_observation: "observation",
    L4_diagnosis: "diagnosis", L5_plan: "plan", verification_gap: "verification_gap"
  } as const)[level];
  const payload = design === "cumulative" || level === "verification_gap" ? cumulative : { [key]: cumulative[key] };
  const keys = new Set(Object.keys(payload));
  const packet: InterventionPacket = {
    schema_version: "0.2",
    task_id: "task-one",
    task_base_commit: "base-commit",
    intervention_level: level,
    design,
    payload,
    source: {
      kind: "synthetic_mechanics_only",
      evidence_refs: ["fixture:trace"],
      fixed_commit_accessible_to_agent: false,
      facts_visible_from_base: true
    },
    information_boundary: {
      allowed_categories: [...keys],
      forbidden_categories: ["patch_text", "hidden_tests"],
      contains_diagnosis: keys.has("diagnosis"),
      contains_plan: keys.has("plan"),
      contains_code_location: keys.has("context") || keys.has("localization"),
      contains_exact_identifier: keys.has("localization") || keys.has("observation"),
      contains_patch_text: false
    },
    review_record_sha256: SHA,
    provenance: {
      created_at: "2026-08-02T00:00:00-04:00",
      rubric_version: "oracle-boundary/1.0.0",
      revision: 1,
      content_sha256: SHA
    }
  };
  packet.provenance.content_sha256 = interventionContentHash(packet);
  return packet;
}

function reviewFor(packet: InterventionPacket): InterventionReview {
  return {
    schema_version: "0.1",
    task_id: packet.task_id,
    intervention_level: packet.intervention_level,
    packet_content_sha256: packet.provenance.content_sha256,
    author_id: "author-one",
    reviews: [{
      reviewer_id: "reviewer-one",
      decision: "approve",
      leak_classification: "clean",
      assigned_level: packet.intervention_level,
      reviewed_at: "2026-08-02T00:01:00-04:00"
    }],
    disagreement: null,
    revision_history: [{ revision: 1, content_sha256: packet.provenance.content_sha256, changed_at: "2026-08-02T00:00:00-04:00" }],
    final_status: "approved",
    finalized_at: "2026-08-02T00:02:00-04:00",
    review_policy_version: "intervention-review/1.0.0"
  };
}

async function writeBundle(packet: InterventionPacket, review = reviewFor(packet)): Promise<{ packetPath: string; reviewPath: string; packetSha: string; reviewSha: string }> {
  const directory = await mkdtemp(join(tmpdir(), "oml-intervention-"));
  const reviewPath = join(directory, "review.json");
  const reviewBytes = Buffer.from(JSON.stringify(review), "utf8");
  await writeFile(reviewPath, reviewBytes);
  packet.review_record_sha256 = createHash("sha256").update(reviewBytes).digest("hex");
  const packetPath = join(directory, "packet.json");
  const packetBytes = Buffer.from(JSON.stringify(packet), "utf8");
  await writeFile(packetPath, packetBytes);
  return {
    packetPath,
    reviewPath,
    packetSha: createHash("sha256").update(packetBytes).digest("hex"),
    reviewSha: packet.review_record_sha256
  };
}

async function load(packet: InterventionPacket, review?: InterventionReview) {
  const paths = await writeBundle(packet, review);
  return loadIntervention({
    packetPath: paths.packetPath,
    reviewPath: paths.reviewPath,
    expectedTaskId: "task-one",
    expectedBaseCommit: "base-commit",
    expectedLevel: packet.intervention_level,
    expectedDesign: packet.design,
    expectedPacketFileSha256: paths.packetSha,
    expectedReviewFileSha256: paths.reviewSha,
    oracleMaterial: { hiddenPaths: [".oml-hidden"], baseIdentifiers: ["scheduleCallback", "handleResult"] }
  });
}

test("loads approved packet and materializes only payload without a treatment label", async () => {
  const loaded = await load(packetFor());
  const assistance = materializeAssistance(loaded, "L3_observation");
  assert.deepEqual(Object.keys(assistance as object).sort(), ["payload", "schema_version"]);
  assert.equal(JSON.stringify(assistance).includes("L3_observation"), false);
});

test("rejects diagnosis and plan leaked into an observation", async () => {
  const packet = packetFor();
  packet.payload.observation!.facts[0]!.statement = "An old callback corrupts the new generation, so add a generation comparison before writing state.";
  packet.provenance.content_sha256 = interventionContentHash(packet);
  await assert.rejects(load(packet), (error: unknown) => error instanceof OmlError && error.code === "OML_LEAK_OBSERVATION_CONTAINS_DIAGNOSIS");
});

test("rejects patch text inside a diagnosis", async () => {
  const packet = packetFor("L4_diagnosis");
  packet.payload.diagnosis!.root_cause = "Add `if callbackGeneration !== currentGeneration return` in handleResult.";
  packet.provenance.content_sha256 = interventionContentHash(packet);
  await assert.rejects(load(packet), (error: unknown) => error instanceof OmlError && error.code === "OML_LEAK_DIAGNOSIS_CONTAINS_PATCH");
});

test("rejects fixed-version-only identifiers inside a behavioral plan", async () => {
  const packet = packetFor("L5_plan");
  packet.payload.plan!.behavioral_objective = "Use the caught marker to preserve the fallback.";
  packet.provenance.content_sha256 = interventionContentHash(packet);
  const paths = await writeBundle(packet);
  await assert.rejects(loadIntervention({
    ...baseOptions(paths, packet),
    oracleMaterial: { fixedOnlyIdentifiers: ["caught"], baseIdentifiers: ["scheduleCallback", "handleResult"] }
  }), matches("OML_LEAK_FIXED_ONLY_IDENTIFIER"));
});

test("rejects packet-task mismatch and stale base commit", async () => {
  const packet = packetFor();
  const paths = await writeBundle(packet);
  await assert.rejects(loadIntervention({ ...baseOptions(paths, packet), expectedTaskId: "other" }), matches("OML_INTERVENTION_TASK_MISMATCH"));
  await assert.rejects(loadIntervention({ ...baseOptions(paths, packet), expectedBaseCommit: "stale" }), matches("OML_STALE_TASK_COMMIT"));
});

test("rejects packet modified after freeze", async () => {
  const packet = packetFor();
  const paths = await writeBundle(packet);
  await writeFile(paths.packetPath, `${JSON.stringify(packet)}\n`, "utf8");
  await assert.rejects(loadIntervention(baseOptions(paths, packet)), matches("OML_EXPERIMENT_FREEZE_MISMATCH"));
});

test("rejects hidden path in payload", async () => {
  const packet = packetFor();
  packet.payload.context!.regions[0]!.path = ".oml-hidden/verifier.ts";
  packet.provenance.content_sha256 = interventionContentHash(packet);
  await assert.rejects(load(packet), matches("OML_LEAK_HIDDEN_PATH"));
});

test("rejects incomplete cumulative and overstuffed independent packets", async () => {
  const cumulative = packetFor("L4_diagnosis");
  delete cumulative.payload.observation;
  cumulative.provenance.content_sha256 = interventionContentHash(cumulative);
  await assert.rejects(load(cumulative), matches("OML_INTERVENTION_CUMULATIVE_INCOMPLETE"));

  const independent = packetFor("L3_observation", "independent");
  independent.payload.context = componentsThrough("L1_context").context!;
  independent.information_boundary.contains_code_location = true;
  independent.provenance.content_sha256 = interventionContentHash(independent);
  await assert.rejects(load(independent), matches("OML_INTERVENTION_COMPONENT_SET_INVALID"));
});

test("rejects missing approval, self-review, and unresolved disagreement", async () => {
  const packet = packetFor();
  const unapproved = reviewFor(packet);
  unapproved.final_status = "revision_required";
  unapproved.finalized_at = null;
  await assert.rejects(load(packet, unapproved), matches("OML_INTERVENTION_REVIEW_NOT_APPROVED"));

  const selfReviewed = reviewFor(packet);
  selfReviewed.reviews[0]!.reviewer_id = selfReviewed.author_id;
  await assert.rejects(load(packet, selfReviewed), matches("OML_INTERVENTION_REVIEW_NOT_INDEPENDENT"));

  const disagreement = reviewFor(packet);
  disagreement.disagreement = { present: true, summary: "Observation may be diagnosis.", resolution: null };
  await assert.rejects(load(packet, disagreement), matches("OML_INTERVENTION_REVIEW_DISAGREEMENT"));
});

test("can require two distinct independent reviewers for Gate H", async () => {
  const packet = packetFor();
  const paths = await writeBundle(packet);
  await assert.rejects(
    loadIntervention({ ...baseOptions(paths, packet), minimumIndependentReviewers: 2 }),
    matches("OML_INTERVENTION_REVIEW_NOT_INDEPENDENT")
  );
});

test("duplicate reviewer identities do not satisfy the two-reviewer policy", async () => {
  const packet = packetFor();
  const review = reviewFor(packet);
  review.reviews.push({ ...review.reviews[0]! });
  const paths = await writeBundle(packet, review);
  await assert.rejects(loadIntervention({ ...baseOptions(paths, packet), minimumIndependentReviewers: 2 }), matches("OML_INTERVENTION_REVIEW_NOT_INDEPENDENT"));
});

test("rejects a packet without provenance", async () => {
  const packet = packetFor() as unknown as Record<string, unknown>;
  delete packet.provenance;
  const directory = await mkdtemp(join(tmpdir(), "oml-no-provenance-"));
  const packetPath = join(directory, "packet.json");
  const reviewPath = join(directory, "review.json");
  await writeFile(packetPath, JSON.stringify(packet), "utf8");
  await writeFile(reviewPath, JSON.stringify(reviewFor(packetFor())), "utf8");
  await assert.rejects(loadIntervention({
    packetPath, reviewPath, expectedTaskId: "task-one", expectedBaseCommit: "base-commit",
    expectedLevel: "L3_observation", expectedDesign: "cumulative"
  }), matches("OML_INTERVENTION_INVALID"));
});

function baseOptions(paths: { packetPath: string; reviewPath: string; packetSha: string; reviewSha: string }, packet: InterventionPacket) {
  return {
    packetPath: paths.packetPath,
    reviewPath: paths.reviewPath,
    expectedTaskId: "task-one",
    expectedBaseCommit: "base-commit",
    expectedLevel: packet.intervention_level,
    expectedDesign: packet.design,
    expectedPacketFileSha256: paths.packetSha,
    expectedReviewFileSha256: paths.reviewSha
  };
}

function matches(code: OmlError["code"]) {
  return (error: unknown) => error instanceof OmlError && error.code === code;
}
