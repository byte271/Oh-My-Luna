import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { canonicalJson } from "./canonical.js";
import { OmlError } from "./errors.js";
import { validateGateMStudyFreeze } from "./schema.js";
import type { GateMStudyFreeze, JsonValue } from "./types.js";

export function gateMFreezeAggregateHash(freeze: GateMStudyFreeze): string {
  const { aggregate_sha256: _ignored, ...identity } = freeze;
  return sha256(canonicalJson(identity as unknown as JsonValue));
}

export async function verifyGateMStudyFreeze(path: string, repositoryRoot: string): Promise<{ freeze: GateMStudyFreeze; fileSha256: string }> {
  const root = await realpath(resolve(repositoryRoot));
  const bytes = await readFile(await realpath(resolve(path)));
  let value: unknown;
  try { value = JSON.parse(bytes.toString("utf8")) as unknown; }
  catch { throw new OmlError("OML_EXPERIMENT_FREEZE_MISMATCH", "Gate M freeze is not valid JSON"); }
  const freeze = await validateGateMStudyFreeze(value);
  if (new Set(freeze.artifacts.map((item) => item.path)).size !== freeze.artifacts.length) {
    throw new OmlError("OML_EXPERIMENT_FREEZE_MISMATCH", "Gate M freeze contains duplicate artifact paths");
  }
  for (const artifact of freeze.artifacts) {
    if (isAbsolute(artifact.path)) throw new OmlError("OML_PATH_ESCAPE", "Frozen artifact path must be relative");
    const target = resolve(root, artifact.path);
    const relation = relative(root, target);
    if (relation === ".." || relation.startsWith(`..${sep}`) || isAbsolute(relation)) throw new OmlError("OML_PATH_ESCAPE", "Frozen artifact escapes repository root");
    let actual: string;
    try { actual = sha256(await readFile(await realpath(target))); }
    catch { throw mismatchForRole(artifact.role, `Frozen artifact is missing: ${artifact.path}`); }
    if (actual !== artifact.sha256) throw mismatchForRole(artifact.role, `Frozen artifact changed: ${artifact.path}`);
  }
  if (freeze.scorer.source_sha256 !== artifactHash(freeze, freeze.scorer.source_path)) {
    throw new OmlError("OML_SCORER_IDENTITY_MISMATCH", "Scorer identity is not bound by the artifact list");
  }
  for (const task of freeze.tasks) {
    const environment = freeze.artifacts.find((item) => item.role === "environment" && item.sha256 === task.environment_definition_sha256);
    if (!environment) throw new OmlError("OML_ENVIRONMENT_IDENTITY_MISMATCH", `Task ${task.task_id} environment is not bound by the artifact list`);
  }
  if (gateMFreezeAggregateHash(freeze) !== freeze.aggregate_sha256) {
    throw new OmlError("OML_EXPERIMENT_FREEZE_MISMATCH", "Gate M aggregate identity is invalid");
  }
  if (freeze.status === "executable" && (!freeze.treatment_execution.executable || !freeze.treatment_execution.schedule_sha256 || freeze.review.agreement_status !== "complete")) {
    throw new OmlError("OML_REVIEW_POLICY_UNSATISFIED", "Executable Gate M freeze lacks completed review or treatment schedule");
  }
  return { freeze, fileSha256: sha256(bytes) };
}

function artifactHash(freeze: GateMStudyFreeze, path: string): string | undefined {
  return freeze.artifacts.find((item) => item.path === path)?.sha256;
}

function mismatchForRole(role: GateMStudyFreeze["artifacts"][number]["role"], message: string): OmlError {
  if (role === "scorer") return new OmlError("OML_SCORER_IDENTITY_MISMATCH", message);
  if (role === "environment") return new OmlError("OML_ENVIRONMENT_IDENTITY_MISMATCH", message);
  if (role === "task") return new OmlError("OML_TASK_POOL_FREEZE_MISMATCH", message);
  return new OmlError("OML_EXPERIMENT_FREEZE_MISMATCH", message);
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}
