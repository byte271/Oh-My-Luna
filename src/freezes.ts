import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import { resolve } from "node:path";
import { OmlError } from "./errors.js";
import { validateExperimentFreeze, validateTaskPool, validateTaskSelectionFreeze } from "./schema.js";
import type { ExperimentFreeze, LoadedFixture, TaskPoolManifest, TaskSelectionFreeze, TreatmentId } from "./types.js";

export interface LoadedTaskSelection {
  pool: TaskPoolManifest;
  freeze: TaskSelectionFreeze;
  poolFileSha256: string;
  freezeFileSha256: string;
}

export interface LoadedExperimentFreeze {
  freeze: ExperimentFreeze;
  fileSha256: string;
}

export async function loadExperimentFreeze(path: string, expectedSha256?: string): Promise<LoadedExperimentFreeze> {
  const bytes = await readFile(await realpath(resolve(path)));
  const fileSha256 = sha256(bytes);
  if (expectedSha256 && expectedSha256 !== fileSha256) {
    throw new OmlError("OML_EXPERIMENT_FREEZE_MISMATCH", "Experiment freeze file hash changed");
  }
  const freeze = await validateExperimentFreeze(parseJson(bytes));
  return { freeze, fileSha256 };
}

export function assertRunMatchesExperimentFreeze(
  freeze: ExperimentFreeze,
  loadedFixture: LoadedFixture,
  treatmentId: TreatmentId,
  packetFileSha256?: string,
  reviewFileSha256?: string
): void {
  const matches = freeze.task_fixtures.filter((item) => item.task_id === loadedFixture.fixture.id);
  if (matches.length !== 1) throw new OmlError("OML_EXPERIMENT_FREEZE_MISMATCH", "Task has zero or duplicate entries in experiment freeze");
  const task = matches[0]!;
  const fixture = loadedFixture.fixture;
  if (task.fixture_sha256 !== loadedFixture.fixtureSha256 || task.repository_commit !== fixture.repository.commit) {
    throw new OmlError("OML_EXPERIMENT_FREEZE_MISMATCH", "Task fixture or repository commit differs from experiment freeze");
  }
  if (freeze.model_snapshot !== fixture.adapter.model_snapshot || freeze.reasoning_effort !== fixture.adapter.reasoning_effort ||
      freeze.environment_definition_sha256 !== fixture.environment.definition_sha256 || freeze.prompts.native_sha256 !== fixture.adapter.prompt_sha256) {
    throw new OmlError("OML_EXPERIMENT_FREEZE_MISMATCH", "Model, prompt, effort, or environment differs from experiment freeze");
  }
  if (treatmentId === "lean_skill" && (!fixture.adapter.skill_sha256 || freeze.prompts.lean_skill_sha256 !== fixture.adapter.skill_sha256)) {
    throw new OmlError("OML_EXPERIMENT_FREEZE_MISMATCH", "Lean-Skill treatment does not match the frozen Skill hash");
  }
  const interventionTreatments = new Set(["L1_context", "L2_localization", "L3_observation", "L4_diagnosis", "L5_plan", "verification_gap"]);
  if (!interventionTreatments.has(treatmentId)) {
    if (packetFileSha256 || reviewFileSha256) throw new OmlError("OML_EXPERIMENT_FREEZE_MISMATCH", "Control treatment cannot bind oracle files");
    return;
  }
  const interventions = freeze.interventions.filter((item) => item.task_id === fixture.id && item.treatment_id === treatmentId);
  if (interventions.length !== 1) throw new OmlError("OML_EXPERIMENT_FREEZE_MISMATCH", "Treatment has zero or duplicate entries in experiment freeze");
  const intervention = interventions[0]!;
  if (intervention.packet_file_sha256 !== packetFileSha256 || intervention.review_file_sha256 !== reviewFileSha256) {
    throw new OmlError("OML_EXPERIMENT_FREEZE_MISMATCH", "Intervention files differ from experiment freeze");
  }
}

export async function loadTaskSelection(poolPath: string, freezePath: string): Promise<LoadedTaskSelection> {
  const [resolvedPool, resolvedFreeze] = await Promise.all([realpath(resolve(poolPath)), realpath(resolve(freezePath))]);
  const [poolBytes, freezeBytes] = await Promise.all([readFile(resolvedPool), readFile(resolvedFreeze)]);
  const poolFileSha256 = sha256(poolBytes);
  const freezeFileSha256 = sha256(freezeBytes);
  const pool = await validateTaskPool(parseJson(poolBytes));
  const freeze = await validateTaskSelectionFreeze(parseJson(freezeBytes));
  if (freeze.task_pool_sha256 !== poolFileSha256) {
    throw new OmlError("OML_TASK_POOL_FREEZE_MISMATCH", "Task pool content changed after selection freeze");
  }
  if (freeze.selection_rule_version !== pool.selection_rule_version) {
    throw new OmlError("OML_TASK_SELECTION_INVALID", "Selection rule version differs between pool and freeze");
  }
  validateSlices(pool, freeze);
  return { pool, freeze, poolFileSha256, freezeFileSha256 };
}

export async function assertFrozenFile(path: string, expectedSha256: string, label: string): Promise<void> {
  const actual = sha256(await readFile(await realpath(resolve(path))));
  if (actual !== expectedSha256) throw new OmlError("OML_EXPERIMENT_FREEZE_MISMATCH", `${label} changed after experiment freeze`);
}

function validateSlices(pool: TaskPoolManifest, freeze: TaskSelectionFreeze): void {
  const candidateIds = pool.candidates.map((candidate) => candidate.id);
  if (new Set(candidateIds).size !== candidateIds.length) {
    throw new OmlError("OML_TASK_SELECTION_INVALID", "Candidate pool contains duplicate task IDs");
  }
  if ((freeze.representative_rule.method === "seeded_random") !== (freeze.representative_rule.randomization_seed !== null)) {
    throw new OmlError("OML_TASK_SELECTION_INVALID", "Representative sampling method and randomization seed are inconsistent");
  }
  const representative = new Set(freeze.representative_task_ids);
  const overlap = freeze.high_gap_task_ids.filter((id) => representative.has(id));
  if (overlap.length > 0) {
    throw new OmlError("OML_TASK_SELECTION_INVALID", `Representative and high-gap slices overlap: ${overlap.join(", ")}`);
  }
  const candidates = new Map(pool.candidates.map((candidate) => [candidate.id, candidate]));
  for (const id of [...freeze.representative_task_ids, ...freeze.high_gap_task_ids]) {
    const candidate = candidates.get(id);
    if (!candidate) throw new OmlError("OML_TASK_SELECTION_INVALID", `Frozen task is absent from candidate pool: ${id}`);
    if (candidate.selection.status !== "included" || !candidate.selection.selected_at) {
      throw new OmlError("OML_TASK_SELECTION_INVALID", `Frozen task was not included before freeze: ${id}`);
    }
    if (candidate.selection.exclusion_reason !== null) {
      throw new OmlError("OML_TASK_SELECTION_INVALID", `Included task retains an exclusion reason: ${id}`);
    }
    if (!candidate.hidden_verifier.available || !candidate.hidden_verifier.sha256) {
      throw new OmlError("OML_TASK_SELECTION_INVALID", `Frozen task lacks a hashed hidden verifier: ${id}`);
    }
    if (!candidate.environment.reproducible || !candidate.licensing.redistribution_permitted) {
      throw new OmlError("OML_TASK_SELECTION_INVALID", `Frozen task lacks reproducible or redistributable mechanics: ${id}`);
    }
    if (!candidate.mechanics.base_fails_hidden_verifier || !candidate.mechanics.fixed_passes_hidden_verifier || !candidate.mechanics.infrastructure_valid) {
      throw new OmlError("OML_TASK_SELECTION_INVALID", `Frozen task has not passed base/fixed/environment validation: ${id}`);
    }
    if (candidate.repository.base_commit === candidate.repository.fixed_commit) {
      throw new OmlError("OML_TASK_SELECTION_INVALID", `Frozen task has identical base and fixed commits: ${id}`);
    }
  }
}

function parseJson(bytes: Buffer): unknown {
  try { return JSON.parse(bytes.toString("utf8")) as unknown; }
  catch { throw new OmlError("OML_TASK_SELECTION_INVALID", "Task selection file is not valid JSON"); }
}

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}
