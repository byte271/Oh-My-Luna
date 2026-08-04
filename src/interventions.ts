import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import { resolve } from "node:path";
import { canonicalJson } from "./canonical.js";
import { OmlError, type ErrorCode } from "./errors.js";
import { validateInterventionPacket, validateInterventionReview } from "./schema.js";
import type {
  InterventionDesign,
  InterventionLevel,
  InterventionPacket,
  InterventionPayload,
  InterventionReview,
  JsonValue,
  TreatmentId
} from "./types.js";

export interface InterventionOracleMaterial {
  hiddenPaths?: string[];
  fixedPatchText?: string;
  fixedOnlyIdentifiers?: string[];
  commitMessage?: string;
  baseIdentifiers?: string[];
}

export interface InterventionLeakFinding {
  code: string;
  severity: "error" | "warning";
  detail: string;
}

export interface LoadedIntervention {
  packet: InterventionPacket;
  review: InterventionReview;
  packetFileSha256: string;
  reviewFileSha256: string;
  packetPath: string;
  reviewPath: string;
  leakFindings: InterventionLeakFinding[];
}

export interface LoadInterventionOptions {
  packetPath: string;
  reviewPath: string;
  expectedTaskId: string;
  expectedBaseCommit: string;
  expectedLevel: InterventionLevel;
  expectedDesign: InterventionDesign;
  expectedPacketFileSha256?: string;
  expectedReviewFileSha256?: string;
  minimumIndependentReviewers?: number;
  oracleMaterial?: InterventionOracleMaterial;
}

const COMPONENTS: Record<Exclude<InterventionLevel, "verification_gap">, Array<keyof InterventionPayload>> = {
  L1_context: ["context"],
  L2_localization: ["context", "localization"],
  L3_observation: ["context", "localization", "observation"],
  L4_diagnosis: ["context", "localization", "observation", "diagnosis"],
  L5_plan: ["context", "localization", "observation", "diagnosis", "plan"]
};

export function interventionContentHash(packet: InterventionPacket): string {
  const { content_sha256: _ignored, ...provenance } = packet.provenance;
  const { review_record_sha256: _reviewBinding, ...content } = packet;
  return sha256(canonicalJson({ ...content, provenance } as unknown as JsonValue));
}

export function scanInterventionLeaks(
  packet: InterventionPacket,
  oracle: InterventionOracleMaterial = {}
): InterventionLeakFinding[] {
  const findings: InterventionLeakFinding[] = [];
  const serialized = canonicalJson(packet.payload as unknown as JsonValue);
  const observationText = packet.payload.observation?.facts.map((fact) => fact.statement).join("\n") ?? "";
  const diagnosisText = packet.payload.diagnosis?.root_cause ?? "";
  const planText = packet.payload.plan?.behavioral_objective ?? "";

  if (/\b(because|root cause|caus(?:e|es|ed)|corrupts?|unauthori[sz]ed|remain(?:s)? authorized)\b/i.test(observationText)) {
    findings.push({ code: "OML_LEAK_OBSERVATION_CONTAINS_DIAGNOSIS", severity: "error", detail: "Observation contains causal or fault-attribution language" });
  }
  if (/\b(?:so|therefore)\s+(?:add|insert|replace|remove|guard|check|change)\b|\b(?:add|insert|replace)\s+(?:a|an|the|`)/i.test(observationText)) {
    findings.push({ code: "OML_LEAK_OBSERVATION_CONTAINS_PLAN", severity: "error", detail: "Observation contains repair instruction language" });
  }
  if (/```|`[^`]*(?:===|!==|==|!=|=>|;)[^`]*`|\bif\s*\(/i.test(diagnosisText)) {
    findings.push({ code: "OML_LEAK_DIAGNOSIS_CONTAINS_PATCH", severity: "error", detail: "Diagnosis contains code-shaped patch text" });
  }
  if (/\b(?:add|insert|replace|remove|change|modify|implement|guard)\b/i.test(diagnosisText)) {
    findings.push({ code: "OML_LEAK_DIAGNOSIS_CONTAINS_PLAN", severity: "error", detail: "Diagnosis prescribes a repair action" });
  }
  if (/```|\bline\s+\d+\b|\b(?:insert|replace)\b|\badd\s+(?:`|[A-Za-z_][A-Za-z0-9_]*\s*(?:condition|check|guard))/i.test(planText)) {
    findings.push({ code: "OML_LEAK_PLAN_CONTAINS_IMPLEMENTATION", severity: "error", detail: "Plan contains line-level or code-level implementation guidance" });
  }

  for (const hiddenPath of oracle.hiddenPaths ?? []) {
    if (serialized.toLowerCase().includes(normalizePath(hiddenPath))) {
      findings.push({ code: "OML_LEAK_HIDDEN_PATH", severity: "error", detail: `Payload references hidden path ${hiddenPath}` });
    }
  }
  for (const identifier of oracle.fixedOnlyIdentifiers ?? []) {
    if (new RegExp(`\\b${escapeRegex(identifier)}\\b`).test(serialized)) {
      findings.push({ code: "OML_LEAK_FIXED_ONLY_IDENTIFIER", severity: "error", detail: `Payload contains fixed-only identifier ${identifier}` });
    }
  }
  if (oracle.fixedPatchText && suspiciousSimilarity(serialized, oracle.fixedPatchText) >= 0.65) {
    findings.push({ code: "OML_LEAK_PATCH_SIMILARITY", severity: "error", detail: "Payload has high token overlap with the fixed patch" });
  }
  if (oracle.commitMessage && tokenSet(serialized).size >= 6 && suspiciousSimilarity(serialized, oracle.commitMessage) >= 0.8) {
    findings.push({ code: "OML_LEAK_COMMIT_MESSAGE_SIMILARITY", severity: "warning", detail: "Payload closely resembles the fixed commit message" });
  }
  const baseIdentifiers = new Set(oracle.baseIdentifiers ?? []);
  if (oracle.baseIdentifiers) {
    for (const symbol of packet.payload.localization?.symbols ?? []) {
      if (!baseIdentifiers.has(symbol.name)) {
        findings.push({ code: "OML_LEAK_IDENTIFIER_NOT_IN_BASE", severity: "error", detail: `Localization identifier is absent from base state: ${symbol.name}` });
      }
    }
  }
  return findings;
}

export async function loadIntervention(options: LoadInterventionOptions): Promise<LoadedIntervention> {
  const packetPath = await realpath(resolve(options.packetPath));
  const reviewPath = await realpath(resolve(options.reviewPath));
  const [packetBytes, reviewBytes] = await Promise.all([readFile(packetPath), readFile(reviewPath)]);
  const packetFileSha256 = sha256(packetBytes);
  const reviewFileSha256 = sha256(reviewBytes);
  checkFrozenHash("packet", options.expectedPacketFileSha256, packetFileSha256);
  checkFrozenHash("review", options.expectedReviewFileSha256, reviewFileSha256);

  const packet = await validateInterventionPacket(parseJson(packetBytes, "packet"));
  const review = await validateInterventionReview(parseJson(reviewBytes, "review"));
  validateBindings(packet, review, options, reviewFileSha256);
  const leakFindings = scanInterventionLeaks(packet, options.oracleMaterial);
  const blockingFinding = leakFindings.find((finding) => finding.severity === "error");
  if (blockingFinding) throw new OmlError(blockingFinding.code as ErrorCode, blockingFinding.detail);
  return { packet, review, packetFileSha256, reviewFileSha256, packetPath, reviewPath, leakFindings };
}

export function materializeAssistance(loaded: LoadedIntervention | undefined, treatment: TreatmentId): JsonValue | undefined {
  if (["native", "lean_skill", "equal_token", "equal_cost"].includes(treatment)) {
    if (loaded) throw new OmlError("OML_INTERVENTION_UNEXPECTED", `Treatment ${treatment} must not receive an intervention packet`);
    return undefined;
  }
  if (!loaded) throw new OmlError("OML_INTERVENTION_REQUIRED", `Treatment ${treatment} requires an approved intervention packet`);
  if (loaded.packet.intervention_level !== treatment) {
    throw new OmlError("OML_INTERVENTION_LEVEL_MISMATCH", "Treatment and packet level differ", {
      treatment,
      packet_level: loaded.packet.intervention_level
    });
  }
  return { schema_version: "0.1", payload: loaded.packet.payload as unknown as JsonValue };
}

function validateBindings(
  packet: InterventionPacket,
  review: InterventionReview,
  options: LoadInterventionOptions,
  reviewFileSha256: string
): void {
  if (packet.task_id !== options.expectedTaskId) throw new OmlError("OML_INTERVENTION_TASK_MISMATCH", "Intervention packet task does not match fixture");
  if (packet.task_base_commit !== options.expectedBaseCommit) throw new OmlError("OML_STALE_TASK_COMMIT", "Intervention packet base commit does not match task fixture");
  if (packet.intervention_level !== options.expectedLevel || packet.design !== options.expectedDesign) {
    throw new OmlError("OML_INTERVENTION_LEVEL_MISMATCH", "Intervention level or design does not match assigned treatment");
  }
  const contentHash = interventionContentHash(packet);
  if (packet.provenance.content_sha256 !== contentHash) throw new OmlError("OML_INTERVENTION_CONTENT_HASH_MISMATCH", "Intervention content hash is invalid");
  if (packet.review_record_sha256 !== reviewFileSha256) throw new OmlError("OML_INTERVENTION_REVIEW_HASH_MISMATCH", "Packet does not bind the supplied review record");
  if (review.task_id !== packet.task_id || review.intervention_level !== packet.intervention_level || review.packet_content_sha256 !== contentHash) {
    throw new OmlError("OML_INTERVENTION_REVIEW_MISMATCH", "Review record does not bind the packet identity and content");
  }
  validateComponentSet(packet);
  validateBoundaryDeclaration(packet);
  validateReview(review, options.minimumIndependentReviewers ?? 1);
  for (const region of packet.payload.context?.regions ?? []) {
    if (region.end_line < region.start_line) throw new OmlError("OML_INTERVENTION_INVALID_REGION", "Context region ends before it starts");
  }
}

function validateComponentSet(packet: InterventionPacket): void {
  const actual = Object.keys(packet.payload).sort();
  const expected = packet.intervention_level === "verification_gap"
    ? ["verification_gap"]
    : packet.design === "independent"
      ? [componentForLevel(packet.intervention_level)]
      : COMPONENTS[packet.intervention_level];
  if (actual.join("|") !== [...expected].sort().join("|")) {
    const code = packet.design === "cumulative" && expected.some((component) => !actual.includes(component))
      ? "OML_INTERVENTION_CUMULATIVE_INCOMPLETE"
      : "OML_INTERVENTION_COMPONENT_SET_INVALID";
    throw new OmlError(code, `Expected components ${expected.join(", ")}; received ${actual.join(", ")}`);
  }
  if (packet.intervention_level === "verification_gap" && packet.design !== "independent") {
    throw new OmlError("OML_INTERVENTION_COMPONENT_SET_INVALID", "Verification-gap rescue must use the independent staged design");
  }
}

function validateBoundaryDeclaration(packet: InterventionPacket): void {
  const components = new Set(Object.keys(packet.payload));
  const expected = {
    contains_diagnosis: components.has("diagnosis"),
    contains_plan: components.has("plan"),
    contains_code_location: components.has("context") || components.has("localization"),
    contains_exact_identifier: components.has("localization") || components.has("observation"),
    contains_patch_text: false
  };
  for (const [key, value] of Object.entries(expected)) {
    if (packet.information_boundary[key as keyof typeof expected] !== value) {
      throw new OmlError("OML_INTERVENTION_BOUNDARY_DECLARATION_INVALID", `Information-boundary declaration ${key} is inconsistent with payload`);
    }
  }
}

function validateReview(review: InterventionReview, minimumIndependentReviewers: number): void {
  if (review.reviews.some((item) => item.reviewer_id === review.author_id)) {
    throw new OmlError("OML_INTERVENTION_REVIEW_NOT_INDEPENDENT", "Packet author cannot approve their own packet");
  }
  if (review.disagreement?.present && !review.disagreement.resolution) {
    throw new OmlError("OML_INTERVENTION_REVIEW_DISAGREEMENT", "Reviewer disagreement is unresolved");
  }
  const independentReviewers = new Set(review.reviews.map((item) => item.reviewer_id));
  if (independentReviewers.size < minimumIndependentReviewers) {
    throw new OmlError("OML_INTERVENTION_REVIEW_NOT_INDEPENDENT", `Intervention requires ${minimumIndependentReviewers} distinct independent reviewers`);
  }
  const cleanApproval = review.reviews.every((item) =>
    item.decision === "approve" && item.leak_classification === "clean" && item.assigned_level === review.intervention_level
  );
  if (review.final_status !== "approved" || !review.finalized_at || !cleanApproval) {
    throw new OmlError("OML_INTERVENTION_REVIEW_NOT_APPROVED", "Intervention review is not a clean final approval");
  }
  const latest = review.revision_history.at(-1);
  if (!latest || latest.content_sha256 !== review.packet_content_sha256) {
    throw new OmlError("OML_INTERVENTION_REVIEW_MISMATCH", "Latest review revision does not match packet content");
  }
}

function componentForLevel(level: Exclude<InterventionLevel, "verification_gap">): keyof InterventionPayload {
  return ({
    L1_context: "context",
    L2_localization: "localization",
    L3_observation: "observation",
    L4_diagnosis: "diagnosis",
    L5_plan: "plan"
  })[level] as keyof InterventionPayload;
}

function checkFrozenHash(kind: string, expected: string | undefined, actual: string): void {
  if (expected && expected !== actual) throw new OmlError("OML_EXPERIMENT_FREEZE_MISMATCH", `Frozen ${kind} hash does not match current file`);
}

function parseJson(bytes: Buffer, label: string): unknown {
  try { return JSON.parse(bytes.toString("utf8")) as unknown; }
  catch { throw new OmlError("OML_INTERVENTION_INVALID", `Intervention ${label} is not valid JSON`); }
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function normalizePath(value: string): string {
  return value.replaceAll("\\", "/").replace(/^\.\//, "").toLowerCase();
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function tokenSet(value: string): Set<string> {
  return new Set(value.toLowerCase().match(/[a-z_][a-z0-9_]+|\d+/g) ?? []);
}

function suspiciousSimilarity(left: string, right: string): number {
  const a = tokenSet(left);
  const b = tokenSet(right);
  if (a.size === 0 || b.size === 0) return 0;
  const intersection = [...a].filter((token) => b.has(token)).length;
  return intersection / Math.min(a.size, b.size);
}
