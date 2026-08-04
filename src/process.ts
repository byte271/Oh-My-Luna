import { spawn } from "node:child_process";
import { OmlError } from "./errors.js";
import type { ProcessResult } from "./types.js";

const SAFE_ENVIRONMENT = ["PATH", "SYSTEMROOT", "WINDIR", "PATHEXT", "COMSPEC", "TMP", "TEMP", "TMPDIR"];

export interface ProcessOptions {
  argv: string[];
  cwd: string;
  stdin?: Buffer | undefined;
  timeoutMs: number;
  maxOutputBytes: number;
  environmentAllowlist?: string[] | undefined;
  signal?: AbortSignal | undefined;
}

export async function runProcess(options: ProcessOptions): Promise<ProcessResult> {
  const [command, ...args] = options.argv;
  if (!command) throw new OmlError("OML_INTERNAL", "Process command is empty");
  const environment: NodeJS.ProcessEnv = {};
  for (const name of new Set([...SAFE_ENVIRONMENT, ...(options.environmentAllowlist ?? [])])) {
    if (process.env[name] !== undefined) environment[name] = process.env[name];
  }

  return await new Promise<ProcessResult>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: environment,
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let bytes = 0;
    let timedOut = false;
    let settled = false;

    let timer: NodeJS.Timeout | undefined;
    const finishError = (error: OmlError): void => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      child.kill("SIGKILL");
      reject(error);
    };
    const collect = (target: Buffer[]) => (chunk: Buffer): void => {
      bytes += chunk.length;
      if (bytes > options.maxOutputBytes) {
        finishError(new OmlError("OML_PROCESS_OUTPUT_LIMIT", "Combined process output exceeded limit", {
          max_output_bytes: options.maxOutputBytes
        }));
        return;
      }
      target.push(chunk);
    };
    child.stdout.on("data", collect(stdout));
    child.stderr.on("data", collect(stderr));
    child.on("error", (error) => finishError(new OmlError("OML_INTERNAL", `Failed to start process: ${error.message}`)));

    timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, options.timeoutMs);

    const onAbort = (): void => {
      child.kill("SIGKILL");
    };
    options.signal?.addEventListener("abort", onAbort, { once: true });

    child.on("close", (exitCode) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
      if (options.signal?.aborted) {
        reject(new OmlError("OML_CANCELLED", "Process cancelled"));
        return;
      }
      if (timedOut) {
        reject(new OmlError("OML_PROCESS_TIMEOUT", "Process exceeded timeout", { timeout_ms: options.timeoutMs }));
        return;
      }
      resolve({ exitCode, stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr), timedOut: false });
    });

    if (options.stdin) child.stdin.end(options.stdin);
    else child.stdin.end();
  });
}

export function expandArgv(argv: string[], fixtureDirectory: string, workspace: string): string[] {
  return argv.map((arg) => arg.replaceAll("{fixture_dir}", fixtureDirectory).replaceAll("{workspace}", workspace));
}
