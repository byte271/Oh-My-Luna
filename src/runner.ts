import { mkdir, realpath, writeFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { ArtifactStore } from "./artifacts.js";
import { calculateCostUsd, totalBillingCost } from "./cost.js";
import { CopyEnvironmentProvider, applyProposedFiles } from "./environment.js";
import { OmlError, toOmlError } from "./errors.js";
import { loadFixture } from "./fixture.js";
import { assertRunMatchesExperimentFreeze, loadExperimentFreeze } from "./freezes.js";
import { interventionContentHash, loadIntervention, materializeAssistance, type InterventionOracleMaterial } from "./interventions.js";
import { ExternalCommandAdapter } from "./model-adapter.js";
import { scoreWorkspace } from "./scoring.js";
import { validateRunReceipt } from "./schema.js";
import { TraceWriter, verifyTrace } from "./trace.js";
import type { ArtifactRecord, InterventionDesign, InterventionLevel, JsonValue, RunReceipt, TokenUsage, TreatmentId } from "./types.js";

export interface RunOptions {
  fixturePath: string;
  runsRoot: string;
  treatmentId?: TreatmentId;
  interventionPath?: string;
  interventionReviewPath?: string;
  interventionDesign?: InterventionDesign;
  expectedPacketFileSha256?: string;
  expectedReviewFileSha256?: string;
  expectedTaskFixtureSha256?: string;
  expectedRepositoryCommit?: string;
  experimentFreezePath?: string;
  expectedExperimentFreezeSha256?: string;
  minimumIndependentReviewers?: number;
  oracleMaterial?: InterventionOracleMaterial;
  scorerCanaries?: string[];
  signal?: AbortSignal | undefined;
}

const ZERO_USAGE: TokenUsage = { input_tokens: 0, cached_input_tokens: 0, output_tokens: 0 };

function resolveFixtureRelative(path: string, fixtureDirectory: string): string {
  return isAbsolute(path) ? path : resolve(fixtureDirectory, path);
}

export async function runEvaluation(options: RunOptions): Promise<{ receipt: RunReceipt; receiptPath: string; runRoot: string }> {
  const loaded = await loadFixture(options.fixturePath);
  if (options.expectedTaskFixtureSha256 && options.expectedTaskFixtureSha256 !== loaded.fixtureSha256) {
    throw new OmlError("OML_EXPERIMENT_FREEZE_MISMATCH", "Frozen task fixture hash does not match current fixture");
  }
  if (options.expectedRepositoryCommit && options.expectedRepositoryCommit !== loaded.fixture.repository.commit) {
    throw new OmlError("OML_STALE_TASK_COMMIT", "Task fixture repository commit does not match frozen commit");
  }
  const treatmentId = options.treatmentId ?? "native";
  const experimentFreeze = options.experimentFreezePath
    ? await loadExperimentFreeze(options.experimentFreezePath, options.expectedExperimentFreezeSha256)
    : undefined;
  const interventionLevel = isInterventionTreatment(treatmentId) ? treatmentId : undefined;
  const interventionDesign = interventionLevel === "verification_gap" ? "independent" : (options.interventionDesign ?? "cumulative");
  const hasEitherInterventionPath = options.interventionPath !== undefined || options.interventionReviewPath !== undefined;
  if (hasEitherInterventionPath && !interventionLevel) {
    throw new OmlError("OML_INTERVENTION_UNEXPECTED", `Treatment ${treatmentId} must not receive oracle files`);
  }
  if (hasEitherInterventionPath && (!options.interventionPath || !options.interventionReviewPath)) {
    throw new OmlError("OML_INTERVENTION_REQUIRED", "Both intervention packet and review paths are required");
  }
  const loadedIntervention = options.interventionPath && options.interventionReviewPath && interventionLevel
    ? await loadIntervention({
        packetPath: options.interventionPath,
        reviewPath: options.interventionReviewPath,
        expectedTaskId: loaded.fixture.id,
        expectedBaseCommit: loaded.fixture.repository.commit,
        expectedLevel: interventionLevel,
        expectedDesign: interventionDesign,
        ...(options.expectedPacketFileSha256 ? { expectedPacketFileSha256: options.expectedPacketFileSha256 } : {}),
        ...(options.expectedReviewFileSha256 ? { expectedReviewFileSha256: options.expectedReviewFileSha256 } : {}),
        ...(options.minimumIndependentReviewers ? { minimumIndependentReviewers: options.minimumIndependentReviewers } : {}),
        oracleMaterial: {
          hiddenPaths: loaded.fixture.confidentiality.hidden_paths,
          ...(options.oracleMaterial ?? {})
        }
      })
    : undefined;
  if (experimentFreeze) {
    assertRunMatchesExperimentFreeze(
      experimentFreeze.freeze,
      loaded,
      treatmentId,
      loadedIntervention?.packetFileSha256,
      loadedIntervention?.reviewFileSha256
    );
  }
  const assistance = materializeAssistance(loadedIntervention, treatmentId);
  if (loaded.fixture.requires_security_sandbox) {
    throw new OmlError("OML_SANDBOX_REQUIRED", "Fixture requires a security sandbox; copy isolation cannot run it");
  }
  const repositoryPath = await realpath(resolveFixtureRelative(loaded.fixture.repository.path, loaded.fixtureDirectory));
  const environment = await new CopyEnvironmentProvider().prepare(repositoryPath, options.runsRoot);
  const runId = randomUUID();
  const startedAt = new Date();
  const tracePath = resolve(environment.root, "trace.jsonl");
  const receiptPath = resolve(environment.root, "receipt.json");
  const trace = new TraceWriter(tracePath, runId);
  const artifacts = new ArtifactStore(resolve(environment.root, "artifacts"));
  const artifactRecords: ArtifactRecord[] = [];
  let usage = { ...ZERO_USAGE };
  let claims: string[] = [];
  let configuredVerifier: RunReceipt["configured_verifier"] = { status: "not_run", exit_code: null };
  let adapterStatus: RunReceipt["adapter_status"] = { status: "not_run", exit_code: null };
  let billing: RunReceipt["billing_records"] = [];
  let costAccuracy: RunReceipt["cost_accuracy"] = "not_applicable";
  let omittedChargeCategories: string[] = [];
  let runStatus: RunReceipt["run_status"] = "error";
  let evaluatorBoundary: RunReceipt["evaluator_boundary"] = {
    classification: "interface_blind_host_confidentiality_not_enforced",
    detached_workspace: false,
    filtered_environment: true,
    treatment_metadata_declared: false,
    canary_count: options.scorerCanaries?.length ?? 0
  };
  const errorCodes: string[] = [];

  await trace.append("run.started", {
    task_id: loaded.fixture.id,
    fixture_path: loaded.fixturePath,
    repository_commit: loaded.fixture.repository.commit,
    isolation: environment.isolation,
    treatment_id: treatmentId,
    intervention_packet_sha256: loadedIntervention?.packetFileSha256 ?? null
  });

  try {
    const request = {
      schema_version: "0.3" as const,
      run_id: runId,
      task_id: loaded.fixture.id,
      issue: loaded.fixture.issue,
      workspace: environment.workspace,
      repository_commit: loaded.fixture.repository.commit,
      ...(assistance === undefined ? {} : { assistance })
    };
    await trace.append("adapter.requested", { adapter_id: loaded.fixture.adapter.id });
    const adapterResult = await new ExternalCommandAdapter(
      loaded.fixture,
      loaded.fixtureDirectory,
      environment.workspace
    ).invoke(request, options.signal);
    adapterStatus = { status: "passed", exit_code: adapterResult.process.exitCode };
    usage = adapterResult.response.usage;
    billing = adapterResult.response.billing.records;
    costAccuracy = adapterResult.response.billing.accuracy;
    omittedChargeCategories = adapterResult.response.billing.omitted_charge_categories;
    validateBillingConsistency(usage, billing, costAccuracy);
    claims = adapterResult.response.claims;
    artifactRecords.push(await artifacts.put("adapter.stderr", adapterResult.process.stderr));
    if (adapterResult.response.raw_trace !== undefined) {
      artifactRecords.push(await artifacts.put("adapter.raw_trace", JSON.stringify(adapterResult.response.raw_trace)));
    }
    await trace.append("adapter.responded", {
      proposed_file_count: adapterResult.response.files.length,
      claim_count: claims.length,
      usage: usage as unknown as JsonValue
    });

    const changedFiles = await applyProposedFiles(environment.workspace, adapterResult.response.files);
    await trace.append("workspace.changed", { files: changedFiles });

    const scored = await scoreWorkspace(
      loaded.fixture,
      loaded.fixtureDirectory,
      environment.workspace,
      options.signal,
      { forbiddenCanaries: options.scorerCanaries ?? [] }
    );
    evaluatorBoundary = {
      classification: scored.boundary.classification,
      detached_workspace: scored.boundary.detachedWorkspace,
      filtered_environment: scored.boundary.filteredEnvironment,
      treatment_metadata_declared: scored.boundary.treatmentMetadataDeclared,
      canary_count: scored.boundary.canaryCount
    };
    configuredVerifier = {
      status: scored.success ? "passed" : "failed",
      exit_code: scored.exitCode
    };
    artifactRecords.push(await artifacts.put("verifier.stdout", scored.process.stdout));
    artifactRecords.push(await artifacts.put("verifier.stderr", scored.process.stderr));
    await trace.append("configured_verifier.finished", {
      status: configuredVerifier.status,
      exit_code: scored.exitCode
    });
    runStatus = "completed";
    if (!scored.success) errorCodes.push("OML_VERIFIER_FAILED");
  } catch (error) {
    const omlError = toOmlError(error);
    if (omlError.code === "OML_ADAPTER_FAILED") {
      adapterStatus = { status: "failed", exit_code: typeof omlError.details.exit_code === "number" ? omlError.details.exit_code : null };
    }
    errorCodes.push(omlError.code);
    runStatus = omlError.code === "OML_CANCELLED" ? "cancelled" : "error";
    await trace.append("run.error", {
      code: omlError.code,
      message: omlError.message,
      details: omlError.details as Record<string, JsonValue>
    });
  }

  await trace.append("run.finished", {
    run_status: runStatus,
    adapter_status: adapterStatus.status,
    configured_verifier_status: configuredVerifier.status,
    claim_evaluation_status: "not_evaluated",
    terminal_evidence_status: "not_evaluated",
    intervention: {
      treatment_id: treatmentId,
      packet_file_sha256: loadedIntervention?.packetFileSha256 ?? null
    },
    error_codes: errorCodes
  });
  const traceHash = await verifyTrace(tracePath);
  const finishedAt = new Date();
  const receipt: RunReceipt = {
    schema_version: "0.3",
    run_id: runId,
    task_id: loaded.fixture.id,
    task_fixture_sha256: loaded.fixtureSha256,
    run_status: runStatus,
    adapter_status: adapterStatus,
    configured_verifier: configuredVerifier,
    claim_evaluation: {
      status: "not_evaluated",
      evaluated_claim_count: 0,
      total_claim_count: claims.length
    },
    terminal_evidence_status: "not_evaluated",
    intervention: {
      treatment_id: treatmentId,
      design: loadedIntervention?.packet.design ?? null,
      packet_file_sha256: loadedIntervention?.packetFileSha256 ?? null,
      packet_content_sha256: loadedIntervention ? interventionContentHash(loadedIntervention.packet) : null,
      review_file_sha256: loadedIntervention?.reviewFileSha256 ?? null
    },
    model: loaded.fixture.adapter.model,
    model_snapshot: loaded.fixture.adapter.model_snapshot,
    reasoning_effort: loaded.fixture.adapter.reasoning_effort,
    prompt_sha256: loaded.fixture.adapter.prompt_sha256,
    skill_sha256: loaded.fixture.adapter.skill_sha256,
    repository_commit: loaded.fixture.repository.commit,
    isolation: environment.isolation,
    environment: {
      id: loaded.fixture.environment.id,
      definition_sha256: loaded.fixture.environment.definition_sha256,
      image_digest: loaded.fixture.environment.image_digest,
      platform: process.platform,
      architecture: process.arch,
      node_version: process.version
    },
    evaluator_boundary: evaluatorBoundary,
    started_at: startedAt.toISOString(),
    finished_at: finishedAt.toISOString(),
    duration_ms: Math.max(0, finishedAt.getTime() - startedAt.getTime()),
    usage,
    cost_usd: billing.length > 0
      ? totalBillingCost(billing)
      : costAccuracy === "not_applicable" ? 0 : calculateCostUsd(usage, loaded.fixture.adapter.rates_usd_per_million_tokens),
    cost_accuracy: costAccuracy,
    billing_records: billing,
    omitted_charge_categories: omittedChargeCategories,
    trace_hash: traceHash,
    artifacts: artifactRecords,
    claims,
    error_codes: errorCodes
  };
  assertReceiptHasNoHiddenArtifacts(receipt, loaded.fixture.confidentiality.hidden_paths);
  await validateRunReceipt(receipt);
  await mkdir(environment.root, { recursive: true });
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
  return { receipt, receiptPath, runRoot: environment.root };
}

export function assertReceiptHasNoHiddenArtifacts(receipt: RunReceipt, hiddenPaths: string[]): void {
  const normalizedHidden = hiddenPaths.map((item) => item.replaceAll("\\", "/").toLowerCase());
  for (const artifact of receipt.artifacts) {
    const metadata = `${artifact.kind}\n${artifact.relative_path}`.replaceAll("\\", "/").toLowerCase();
    if (normalizedHidden.some((hidden) => hidden.length > 0 && metadata.includes(hidden))) {
      throw new OmlError("OML_HIDDEN_ARTIFACT_EXPOSED", "Receipt exposes control-only artifact metadata");
    }
  }
}

function isInterventionTreatment(value: TreatmentId): value is InterventionLevel {
  return ["L1_context", "L2_localization", "L3_observation", "L4_diagnosis", "L5_plan", "verification_gap"].includes(value);
}

function validateBillingConsistency(
  usage: TokenUsage,
  records: RunReceipt["billing_records"],
  accuracy: RunReceipt["cost_accuracy"]
): void {
  if (accuracy === "not_applicable") {
    if (records.length !== 0 || usage.input_tokens !== 0 || usage.cached_input_tokens !== 0 || usage.output_tokens !== 0) {
      throw new OmlError("OML_RECEIPT_INCONSISTENT", "Not-applicable billing must have zero usage and no billing records");
    }
    return;
  }
  if (records.length === 0) throw new OmlError("OML_RECEIPT_INCONSISTENT", "Billable adapter response must include per-request billing records");
  const sums = records.reduce((result, record) => ({
    input: result.input + record.input_tokens,
    cached: result.cached + record.cached_input_tokens,
    output: result.output + record.output_tokens
  }), { input: 0, cached: 0, output: 0 });
  if (sums.input !== usage.input_tokens || sums.cached !== usage.cached_input_tokens || sums.output !== usage.output_tokens) {
    throw new OmlError("OML_RECEIPT_INCONSISTENT", "Aggregate usage differs from per-request billing records");
  }
  for (const record of records) {
    const components = record.token_cost_usd + record.tool_cost_usd + record.specialist_cost_usd;
    if (Math.abs(components - record.total_cost_usd) > 1e-9) {
      throw new OmlError("OML_RECEIPT_INCONSISTENT", `Billing record ${record.request_id} total does not equal its components`);
    }
  }
}
