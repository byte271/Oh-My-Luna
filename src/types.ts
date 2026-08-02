export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface TokenUsage {
  input_tokens: number;
  cached_input_tokens: number;
  output_tokens: number;
}

export interface TokenRates {
  input: number;
  cached_input: number;
  output: number;
}

export interface TaskFixture {
  schema_version: "0.1";
  id: string;
  issue: string;
  repository: { path: string; commit: string };
  adapter: {
    id: string;
    command: string[];
    model: string;
    reasoning_effort: string;
    environment_allowlist?: string[];
    rates_usd_per_million_tokens: TokenRates;
  };
  verifier: { command: string[]; success_exit_codes: number[] };
  limits: {
    adapter_timeout_ms: number;
    verifier_timeout_ms: number;
    max_output_bytes: number;
  };
  requires_security_sandbox?: boolean;
  metadata?: Record<string, string | number | boolean>;
}

export interface LoadedFixture {
  fixture: TaskFixture;
  fixtureDirectory: string;
  fixturePath: string;
}

export interface ModelRequest {
  schema_version: "0.1";
  run_id: string;
  task_id: string;
  issue: string;
  workspace: string;
  repository_commit: string;
}

export interface ProposedFile {
  path: string;
  content: string;
}

export interface ModelResponse {
  schema_version: "0.1";
  files: ProposedFile[];
  claims: string[];
  usage: TokenUsage;
  raw_trace?: JsonValue;
}

export interface ArtifactRecord {
  kind: string;
  sha256: string;
  bytes: number;
  relative_path: string;
}

export type RunStatus = "verified" | "failed" | "error" | "cancelled";

export interface RunReceipt {
  schema_version: "0.1";
  run_id: string;
  task_id: string;
  status: RunStatus;
  model: string;
  reasoning_effort: string;
  repository_commit: string;
  isolation: "filesystem_copy_only" | "security_sandbox";
  started_at: string;
  finished_at: string;
  duration_ms: number;
  score: { success: boolean; exit_code: number | null };
  usage: TokenUsage;
  cost_usd: number;
  trace_hash: string;
  artifacts: ArtifactRecord[];
  claims: string[];
  error_codes: string[];
}

export interface TraceEvent {
  schema_version: "0.1";
  run_id: string;
  sequence: number;
  timestamp: string;
  type: string;
  payload: Record<string, JsonValue>;
  previous_hash: string | null;
  hash: string;
}

export interface ProcessResult {
  exitCode: number | null;
  stdout: Buffer;
  stderr: Buffer;
  timedOut: boolean;
}
