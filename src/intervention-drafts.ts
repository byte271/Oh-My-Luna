import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import { resolve } from "node:path";
import { canonicalJson } from "./canonical.js";
import { OmlError, type ErrorCode } from "./errors.js";
import { scanInterventionLeaks, type InterventionLeakFinding, type InterventionOracleMaterial } from "./interventions.js";
import { validateInterventionDraft } from "./schema.js";
import type { InterventionDraft, InterventionLevel, InterventionPacket, InterventionPayload, JsonValue } from "./types.js";

const COMPONENTS: Record<InterventionDraft["intervention_level"], Array<keyof InterventionPayload>> = {
  L1_context: ["context"],
  L2_localization: ["context", "localization"],
  L3_observation: ["context", "localization", "observation"],
  L4_diagnosis: ["context", "localization", "observation", "diagnosis"],
  L5_plan: ["context", "localization", "observation", "diagnosis", "plan"]
};

export interface LoadedInterventionDraft {
  draft: InterventionDraft;
  fileSha256: string;
  leakFindings: InterventionLeakFinding[];
}

export function interventionDraftContentHash(draft: InterventionDraft): string {
  const { content_sha256: _ignored, ...provenance } = draft.provenance;
  return sha256(canonicalJson({ ...draft, provenance } as unknown as JsonValue));
}

export async function loadInterventionDraft(options: {
  path: string;
  expectedTaskId: string;
  expectedBaseCommit: string;
  expectedLevel: Exclude<InterventionLevel, "verification_gap">;
  expectedFileSha256?: string;
  oracleMaterial?: InterventionOracleMaterial;
}): Promise<LoadedInterventionDraft> {
  const bytes = await readFile(await realpath(resolve(options.path)));
  const fileSha256 = sha256(bytes);
  if (options.expectedFileSha256 && options.expectedFileSha256 !== fileSha256) {
    throw new OmlError("OML_EXPERIMENT_FREEZE_MISMATCH", "Frozen intervention draft changed");
  }
  let value: unknown;
  try { value = JSON.parse(bytes.toString("utf8")) as unknown; }
  catch { throw new OmlError("OML_INTERVENTION_DRAFT_INVALID", "Intervention draft is not valid JSON"); }
  const draft = await validateInterventionDraft(value);
  if (draft.task_id !== options.expectedTaskId) throw new OmlError("OML_INTERVENTION_TASK_MISMATCH", "Draft task binding differs");
  if (draft.task_base_commit !== options.expectedBaseCommit) throw new OmlError("OML_STALE_TASK_COMMIT", "Draft base commit differs");
  if (draft.intervention_level !== options.expectedLevel) throw new OmlError("OML_INTERVENTION_LEVEL_MISMATCH", "Draft level differs");
  if (draft.provenance.content_sha256 !== interventionDraftContentHash(draft)) {
    throw new OmlError("OML_INTERVENTION_CONTENT_HASH_MISMATCH", "Draft content hash is invalid");
  }
  validateComponentSet(draft);
  validateBoundary(draft);
  const packetLike = { ...draft, schema_version: "0.2", review_record_sha256: "0".repeat(64) } as unknown as InterventionPacket;
  const leakFindings = scanInterventionLeaks(packetLike, options.oracleMaterial);
  const blocking = leakFindings.find((finding) => finding.severity === "error");
  if (blocking) throw new OmlError(blocking.code as ErrorCode, blocking.detail);
  return { draft, fileSha256, leakFindings };
}

export function materializeDraftForReview(loaded: LoadedInterventionDraft): JsonValue {
  return { schema_version: "0.1", payload: loaded.draft.payload as unknown as JsonValue };
}

function validateComponentSet(draft: InterventionDraft): void {
  const actual = Object.keys(draft.payload).sort();
  const expected = draft.design === "cumulative"
    ? COMPONENTS[draft.intervention_level]
    : [COMPONENTS[draft.intervention_level].at(-1)!];
  if (actual.join("|") !== [...expected].sort().join("|")) {
    const missing = draft.design === "cumulative" && expected.some((item) => !actual.includes(item));
    throw new OmlError(missing ? "OML_INTERVENTION_CUMULATIVE_INCOMPLETE" : "OML_INTERVENTION_COMPONENT_SET_INVALID", "Draft component set violates its design");
  }
}

function validateBoundary(draft: InterventionDraft): void {
  const components = new Set(Object.keys(draft.payload));
  const expected = {
    contains_diagnosis: components.has("diagnosis"),
    contains_plan: components.has("plan"),
    contains_code_location: components.has("context") || components.has("localization"),
    contains_exact_identifier: components.has("localization") || components.has("observation"),
    contains_patch_text: false
  };
  for (const [key, value] of Object.entries(expected)) {
    if (draft.information_boundary[key as keyof typeof expected] !== value) {
      throw new OmlError("OML_INTERVENTION_BOUNDARY_DECLARATION_INVALID", `Draft boundary declaration ${key} is inconsistent`);
    }
  }
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}
