import { mkdir, realpath, writeFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { ArtifactStore } from "./artifacts.js";
import { calculateCostUsd } from "./cost.js";
import { CopyEnvironmentProvider, applyProposedFiles } from "./environment.js";
import { OmlError, toOmlError } from "./errors.js";
import { loadFixture } from "./fixture.js";
import { ExternalCommandAdapter } from "./model-adapter.js";
import { scoreWorkspace } from "./scoring.js";
import { validateRunReceipt } from "./schema.js";
import { TraceWriter, verifyTrace } from "./trace.js";
import type { ArtifactRecord, JsonValue, RunReceipt, TokenUsage } from "./types.js";

export interface RunOptions {
  fixturePath: string;
  runsRoot: string;
  signal?: AbortSignal | undefined;
}

const ZERO_USAGE: TokenUsage = { input_tokens: 0, cached_input_tokens: 0, output_tokens: 0 };

function resolveFixtureRelative(path: string, fixtureDirectory: string): string {
  return isAbsolute(path) ? path : resolve(fixtureDirectory, path);
}

export async function runEvaluation(options: RunOptions): Promise<{ receipt: RunReceipt; receiptPath: string; runRoot: string }> {
  const loaded = await loadFixture(options.fixturePath);
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
  let score = { success: false, exit_code: null as number | null };
  let status: RunReceipt["status"] = "error";
  const errorCodes: string[] = [];

  await trace.append("run.started", {
    task_id: loaded.fixture.id,
    fixture_path: loaded.fixturePath,
    repository_commit: loaded.fixture.repository.commit,
    isolation: environment.isolation
  });

  try {
    const request = {
      schema_version: "0.1" as const,
      run_id: runId,
      task_id: loaded.fixture.id,
      issue: loaded.fixture.issue,
      workspace: environment.workspace,
      repository_commit: loaded.fixture.repository.commit
    };
    await trace.append("adapter.requested", { adapter_id: loaded.fixture.adapter.id });
    const adapterResult = await new ExternalCommandAdapter(
      loaded.fixture,
      loaded.fixtureDirectory,
      environment.workspace
    ).invoke(request, options.signal);
    usage = adapterResult.response.usage;
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

    const scored = await scoreWorkspace(loaded.fixture, loaded.fixtureDirectory, environment.workspace, options.signal);
    score = { success: scored.success, exit_code: scored.exitCode };
    artifactRecords.push(await artifacts.put("verifier.stdout", scored.process.stdout));
    artifactRecords.push(await artifacts.put("verifier.stderr", scored.process.stderr));
    await trace.append("verification.finished", { success: scored.success, exit_code: scored.exitCode });
    status = scored.success ? "verified" : "failed";
    if (!scored.success) errorCodes.push("OML_VERIFIER_FAILED");
  } catch (error) {
    const omlError = toOmlError(error);
    errorCodes.push(omlError.code);
    status = omlError.code === "OML_CANCELLED" ? "cancelled" : "error";
    await trace.append("run.error", {
      code: omlError.code,
      message: omlError.message,
      details: omlError.details as Record<string, JsonValue>
    });
  }

  await trace.append("run.finished", { status, error_codes: errorCodes });
  const traceHash = await verifyTrace(tracePath);
  const finishedAt = new Date();
  const receipt: RunReceipt = {
    schema_version: "0.1",
    run_id: runId,
    task_id: loaded.fixture.id,
    status,
    model: loaded.fixture.adapter.model,
    reasoning_effort: loaded.fixture.adapter.reasoning_effort,
    repository_commit: loaded.fixture.repository.commit,
    isolation: environment.isolation,
    started_at: startedAt.toISOString(),
    finished_at: finishedAt.toISOString(),
    duration_ms: Math.max(0, finishedAt.getTime() - startedAt.getTime()),
    score,
    usage,
    cost_usd: calculateCostUsd(usage, loaded.fixture.adapter.rates_usd_per_million_tokens),
    trace_hash: traceHash,
    artifacts: artifactRecords,
    claims,
    error_codes: errorCodes
  };
  await validateRunReceipt(receipt);
  await mkdir(environment.root, { recursive: true });
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
  return { receipt, receiptPath, runRoot: environment.root };
}
