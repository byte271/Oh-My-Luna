import { OmlError } from "./errors.js";
import { expandArgv, runProcess } from "./process.js";
import { validateModelResponse } from "./schema.js";
import type { ModelRequest, ModelResponse, ProcessResult, TaskFixture } from "./types.js";

export interface ModelAdapterResult {
  response: ModelResponse;
  process: ProcessResult;
}

export interface ModelAdapter {
  invoke(request: ModelRequest, signal?: AbortSignal): Promise<ModelAdapterResult>;
}

export class ExternalCommandAdapter implements ModelAdapter {
  readonly #fixture: TaskFixture;
  readonly #fixtureDirectory: string;
  readonly #workspace: string;

  constructor(fixture: TaskFixture, fixtureDirectory: string, workspace: string) {
    this.#fixture = fixture;
    this.#fixtureDirectory = fixtureDirectory;
    this.#workspace = workspace;
  }

  async invoke(request: ModelRequest, signal?: AbortSignal): Promise<ModelAdapterResult> {
    const process = await runProcess({
      argv: expandArgv(this.#fixture.adapter.command, this.#fixtureDirectory, this.#workspace),
      cwd: this.#fixtureDirectory,
      stdin: Buffer.from(JSON.stringify(request), "utf8"),
      timeoutMs: this.#fixture.limits.adapter_timeout_ms,
      maxOutputBytes: this.#fixture.limits.max_output_bytes,
      environmentAllowlist: this.#fixture.adapter.environment_allowlist,
      signal
    });
    if (process.exitCode !== 0) {
      throw new OmlError("OML_ADAPTER_FAILED", "Model adapter exited unsuccessfully", {
        exit_code: process.exitCode
      });
    }
    let raw: unknown;
    try {
      raw = JSON.parse(process.stdout.toString("utf8"));
    } catch {
      throw new OmlError("OML_ADAPTER_RESPONSE_INVALID", "Model adapter stdout is not one JSON object");
    }
    const response = await validateModelResponse(raw);
    if (response.usage.cached_input_tokens > response.usage.input_tokens) {
      throw new OmlError("OML_ADAPTER_RESPONSE_INVALID", "Cached input tokens exceed total input tokens");
    }
    return { response, process };
  }
}
