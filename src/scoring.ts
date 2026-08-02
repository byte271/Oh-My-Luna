import { expandArgv, runProcess } from "./process.js";
import type { ProcessResult, TaskFixture } from "./types.js";

export interface ScoreResult {
  success: boolean;
  exitCode: number | null;
  process: ProcessResult;
}

export async function scoreWorkspace(
  fixture: TaskFixture,
  fixtureDirectory: string,
  workspace: string,
  signal?: AbortSignal
): Promise<ScoreResult> {
  const process = await runProcess({
    argv: expandArgv(fixture.verifier.command, fixtureDirectory, workspace),
    cwd: workspace,
    timeoutMs: fixture.limits.verifier_timeout_ms,
    maxOutputBytes: fixture.limits.max_output_bytes,
    signal
  });
  return {
    success: process.exitCode !== null && fixture.verifier.success_exit_codes.includes(process.exitCode),
    exitCode: process.exitCode,
    process
  };
}
