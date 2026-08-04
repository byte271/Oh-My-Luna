import { cp, mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { OmlError } from "./errors.js";
import { expandArgv, runProcess } from "./process.js";
import type { ProcessResult, TaskFixture } from "./types.js";
import { direntParent } from "./dirent.js";

export interface ScoreResult {
  success: boolean;
  exitCode: number | null;
  process: ProcessResult;
  boundary: {
    classification: "interface_blind_host_confidentiality_not_enforced";
    detachedWorkspace: boolean;
    filteredEnvironment: boolean;
    treatmentMetadataDeclared: false;
    canaryCount: number;
  };
}

export interface ScoreOptions {
  forbiddenCanaries?: string[];
}

export interface ScorerDeclaredInterface {
  argv: string[];
  cwd: string;
  environment: Record<string, string>;
  stdin: string;
  filenames: string[];
}

export function validateScorerDeclaredInterface(declared: ScorerDeclaredInterface, canaries: string[]): void {
  assertNoCanary("argv", declared.argv.join("\u0000"), canaries);
  assertNoCanary("cwd", declared.cwd, canaries);
  assertNoCanary("environment", JSON.stringify(declared.environment), canaries);
  assertNoCanary("stdin", declared.stdin, canaries);
  assertNoCanary("workspace_filename", declared.filenames.join("\u0000"), canaries);
}

export async function scoreWorkspace(
  fixture: TaskFixture,
  fixtureDirectory: string,
  workspace: string,
  signal?: AbortSignal,
  options: ScoreOptions = {}
): Promise<ScoreResult> {
  const canaries = [...new Set(options.forbiddenCanaries ?? [])].filter((item) => item.length > 0);
  const scratchRoot = resolve(process.cwd(), ".oml-score-temp");
  await mkdir(scratchRoot, { recursive: true });
  const scoringRoot = await mkdtemp(join(scratchRoot, "score-"));
  const detachedWorkspace = join(scoringRoot, "workspace");
  try {
    await cp(workspace, detachedWorkspace, { recursive: true, dereference: false, verbatimSymlinks: true });
    await assertNoCanaryPath(detachedWorkspace, canaries);
    const argv = expandArgv(fixture.verifier.command, fixtureDirectory, detachedWorkspace);
    validateScorerDeclaredInterface({ argv, cwd: detachedWorkspace, environment: {}, stdin: "", filenames: [] }, canaries);
    let process: ProcessResult;
    try {
      process = await runProcess({
        argv,
        cwd: detachedWorkspace,
        timeoutMs: fixture.limits.verifier_timeout_ms,
        maxOutputBytes: fixture.limits.max_output_bytes,
        signal
      });
    } catch (error) {
      if (error instanceof OmlError && error.code === "OML_PROCESS_TIMEOUT") {
        throw new OmlError("OML_SCORER_TIMEOUT", "Evaluator process exceeded its frozen timeout", error.details);
      }
      if (error instanceof OmlError && error.code === "OML_CANCELLED") throw error;
      if (error instanceof OmlError && error.code === "OML_PROCESS_OUTPUT_LIMIT") throw error;
      const message = error instanceof Error ? error.message : String(error);
      throw new OmlError("OML_SCORER_FAILED", `Evaluator process could not complete: ${message}`);
    }
    assertNoCanary("stdout", process.stdout.toString("utf8"), canaries);
    assertNoCanary("stderr", process.stderr.toString("utf8"), canaries);
    return {
      success: process.exitCode !== null && fixture.verifier.success_exit_codes.includes(process.exitCode),
      exitCode: process.exitCode,
      process,
      boundary: {
        classification: "interface_blind_host_confidentiality_not_enforced",
        detachedWorkspace: true,
        filteredEnvironment: true,
        treatmentMetadataDeclared: false,
        canaryCount: canaries.length
      }
    };
  } finally {
    await rm(scoringRoot, { recursive: true, force: true });
  }
}

function assertNoCanary(channel: string, value: string, canaries: string[]): void {
  const matched = canaries.find((canary) => value.includes(canary));
  if (matched) {
    throw new OmlError("OML_SCORER_BLINDNESS_VIOLATION", `Evaluator ${channel} contains controller-only canary`, {
      channel,
      canary_sha256_disclosed: false
    });
  }
}

async function assertNoCanaryPath(root: string, canaries: string[]): Promise<void> {
  if (canaries.length === 0) return;
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  for (const entry of entries) {
    const parent = direntParent(entry, root);
    assertNoCanary("workspace_filename", relative(root, join(parent, entry.name)), canaries);
  }
}
