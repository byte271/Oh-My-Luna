import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Ajv2020, type ValidateFunction } from "ajv/dist/2020.js";
import { OmlError } from "./errors.js";
import type { ExperimentFreeze, ExperimentPlan, GateMStudyFreeze, InterventionDraft, InterventionPacket, InterventionReview, ModelResponse, PricingEvidence, PricingSnapshot, RunReceipt, TaskFixture, TaskManifestRecord, TaskPoolManifest, TaskSelectionFreeze } from "./types.js";

const ajv = new Ajv2020({ allErrors: true, strict: true, validateFormats: false });
const cache = new Map<string, ValidateFunction>();

async function validator(relativePath: string): Promise<ValidateFunction> {
  const existing = cache.get(relativePath);
  if (existing) return existing;
  const schemaPath = fileURLToPath(new URL(`../../schemas/${relativePath}`, import.meta.url));
  const schema = JSON.parse(await readFile(schemaPath, "utf8")) as object;
  const compiled = ajv.compile(schema);
  cache.set(relativePath, compiled);
  return compiled;
}

async function assertSchema<T>(value: unknown, relativePath: string, label: string): Promise<T> {
  const validate = await validator(relativePath);
  if (!validate(value)) {
    throw new OmlError("OML_FIXTURE_INVALID", `${label} failed schema validation`, {
      errors: validate.errors ?? []
    });
  }
  return value as T;
}

export function validateTaskFixture(value: unknown): Promise<TaskFixture> {
  return assertSchema<TaskFixture>(value, "task-fixture.schema.json", "Task fixture");
}

export function validateTaskManifest(value: unknown): Promise<TaskManifestRecord> {
  return assertSchema<TaskManifestRecord>(value, "task-manifest.schema.json", "Task manifest");
}

export function validateRunReceipt(value: unknown): Promise<RunReceipt> {
  return assertSchema<RunReceipt>(value, "run-receipt/schema.json", "Run receipt");
}

export function validatePricingSnapshot(value: unknown): Promise<PricingSnapshot> {
  return assertSchema<PricingSnapshot>(value, "pricing-snapshot.schema.json", "Pricing snapshot");
}

export async function validateInterventionPacket(value: unknown): Promise<InterventionPacket> {
  try {
    return await assertSchema<InterventionPacket>(value, "intervention-packet.schema.json", "Intervention packet");
  } catch (error) {
    if (error instanceof OmlError) {
      throw new OmlError("OML_INTERVENTION_INVALID", error.message, error.details);
    }
    throw error;
  }
}

export async function validateInterventionDraft(value: unknown): Promise<InterventionDraft> {
  try {
    return await assertSchema<InterventionDraft>(value, "intervention-draft.schema.json", "Intervention draft");
  } catch (error) {
    if (error instanceof OmlError) throw new OmlError("OML_INTERVENTION_DRAFT_INVALID", error.message, error.details);
    throw error;
  }
}

export async function validateInterventionReview(value: unknown): Promise<InterventionReview> {
  try {
    return await assertSchema<InterventionReview>(value, "intervention-review.schema.json", "Intervention review");
  } catch (error) {
    if (error instanceof OmlError) throw new OmlError("OML_INTERVENTION_INVALID", error.message, error.details);
    throw error;
  }
}

export function validatePricingEvidence(value: unknown): Promise<PricingEvidence> {
  return assertSchema<PricingEvidence>(value, "pricing-evidence.schema.json", "Pricing evidence");
}

export async function validateTaskPool(value: unknown): Promise<TaskPoolManifest> {
  try { return await assertSchema<TaskPoolManifest>(value, "task-pool.schema.json", "Task pool"); }
  catch (error) {
    if (error instanceof OmlError) throw new OmlError("OML_TASK_SELECTION_INVALID", error.message, error.details);
    throw error;
  }
}

export async function validateTaskSelectionFreeze(value: unknown): Promise<TaskSelectionFreeze> {
  try { return await assertSchema<TaskSelectionFreeze>(value, "task-selection-freeze.schema.json", "Task selection freeze"); }
  catch (error) {
    if (error instanceof OmlError) throw new OmlError("OML_TASK_SELECTION_INVALID", error.message, error.details);
    throw error;
  }
}

export async function validateExperimentFreeze(value: unknown): Promise<ExperimentFreeze> {
  try { return await assertSchema<ExperimentFreeze>(value, "experiment-freeze.schema.json", "Experiment freeze"); }
  catch (error) {
    if (error instanceof OmlError) throw new OmlError("OML_EXPERIMENT_FREEZE_MISMATCH", error.message, error.details);
    throw error;
  }
}

export async function validateGateMStudyFreeze(value: unknown): Promise<GateMStudyFreeze> {
  try { return await assertSchema<GateMStudyFreeze>(value, "gate-m-study-freeze.schema.json", "Gate M study freeze"); }
  catch (error) {
    if (error instanceof OmlError) throw new OmlError("OML_EXPERIMENT_FREEZE_MISMATCH", error.message, error.details);
    throw error;
  }
}

export function validateExperimentPlan(value: unknown): Promise<ExperimentPlan> {
  return assertSchema<ExperimentPlan>(value, "experiment-plan.schema.json", "Experiment plan");
}

export function validateMethodValidationFixtures(value: unknown): Promise<unknown> {
  return assertSchema<unknown>(value, "method-validation-fixtures.schema.json", "Method-validation fixture catalog");
}

export async function validateModelResponse(value: unknown): Promise<ModelResponse> {
  try {
    return await assertSchema<ModelResponse>(value, "model-response.schema.json", "Model response");
  } catch (error) {
    if (error instanceof OmlError) {
      throw new OmlError("OML_ADAPTER_RESPONSE_INVALID", error.message, error.details);
    }
    throw error;
  }
}
