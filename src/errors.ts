export type ErrorCode =
  | "OML_FIXTURE_INVALID"
  | "OML_SANDBOX_REQUIRED"
  | "OML_PROCESS_TIMEOUT"
  | "OML_PROCESS_OUTPUT_LIMIT"
  | "OML_ADAPTER_FAILED"
  | "OML_ADAPTER_RESPONSE_INVALID"
  | "OML_PATH_ESCAPE"
  | "OML_SYMLINK_REJECTED"
  | "OML_VERIFIER_FAILED"
  | "OML_CANCELLED"
  | "OML_INTERNAL";

export class OmlError extends Error {
  readonly code: ErrorCode;
  readonly details: Readonly<Record<string, unknown>>;

  constructor(code: ErrorCode, message: string, details: Readonly<Record<string, unknown>> = {}) {
    super(message);
    this.name = "OmlError";
    this.code = code;
    this.details = details;
  }
}

export function toOmlError(error: unknown): OmlError {
  if (error instanceof OmlError) return error;
  if (error instanceof Error) return new OmlError("OML_INTERNAL", error.message);
  return new OmlError("OML_INTERNAL", String(error));
}
