import { isAbsolute, normalize } from "node:path";

/**
 * Validates provider output before it is allowed to touch a workspace.
 *
 * The governing rule: a fluent natural-language answer that claims the task is
 * done, but carries no applicable change, is a FAILED attempt. Model prose is
 * not evidence of a repair, and treating it as one would silently inflate
 * every success rate this project measures.
 */

export type OutputVerdict =
  | { readonly ok: true; readonly files: ReadonlyArray<{ path: string; contents: string }> }
  | { readonly ok: false; readonly reason: OutputRejection; readonly detail: string };

export type OutputRejection =
  | "response_incomplete"
  | "response_not_completed"
  | "no_output_text"
  | "output_too_large"
  | "not_json"
  | "no_files_array"
  | "empty_change_set"
  | "invalid_file_entry"
  | "path_not_permitted"
  | "path_escapes_workspace"
  | "unrelated_file";

export interface OutputValidationOptions {
  /** Terminal status reported by the provider. */
  readonly status: string | null;
  readonly incompleteReason: string | null;
  readonly maxBytes: number;
  /**
   * Paths the task is permitted to modify. A change outside this set is
   * rejected rather than applied, so an attempt cannot pass by editing
   * something unrelated (including an evaluator).
   */
  readonly permittedPaths: readonly string[];
}

export function validateProviderOutput(text: string, options: OutputValidationOptions): OutputVerdict {
  if (options.status !== null && options.status !== "completed") {
    if (options.incompleteReason) {
      return {
        ok: false,
        reason: "response_incomplete",
        detail: `status=${options.status} incomplete_reason=${options.incompleteReason}`
      };
    }
    return { ok: false, reason: "response_not_completed", detail: `status=${options.status}` };
  }

  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return { ok: false, reason: "no_output_text", detail: "provider returned no output text" };
  }
  if (Buffer.byteLength(trimmed, "utf8") > options.maxBytes) {
    return { ok: false, reason: "output_too_large", detail: `output exceeds ${options.maxBytes} bytes` };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    // A prose answer lands here. It is a failure, not a partial success.
    return { ok: false, reason: "not_json", detail: "output is not a JSON change set" };
  }
  if (typeof parsed !== "object" || parsed === null || !Array.isArray((parsed as { files?: unknown }).files)) {
    return { ok: false, reason: "no_files_array", detail: "output has no files array" };
  }

  const rawFiles = (parsed as { files: unknown[] }).files;
  if (rawFiles.length === 0) {
    return { ok: false, reason: "empty_change_set", detail: "output proposes no file changes" };
  }

  const permitted = new Set(options.permittedPaths.map((p) => normalize(p)));
  const files: Array<{ path: string; contents: string }> = [];
  for (const entry of rawFiles) {
    if (
      typeof entry !== "object" ||
      entry === null ||
      typeof (entry as { path?: unknown }).path !== "string" ||
      typeof (entry as { contents?: unknown }).contents !== "string"
    ) {
      return { ok: false, reason: "invalid_file_entry", detail: "each file needs string path and contents" };
    }
    const raw = (entry as { path: string }).path;
    if (isAbsolute(raw)) {
      return { ok: false, reason: "path_escapes_workspace", detail: raw };
    }
    const path = normalize(raw);
    if (path.startsWith("..")) {
      return { ok: false, reason: "path_escapes_workspace", detail: raw };
    }
    if (permitted.size > 0 && !permitted.has(path)) {
      return { ok: false, reason: "path_not_permitted", detail: path };
    }
    files.push({ path, contents: (entry as { contents: string }).contents });
  }

  return { ok: true, files };
}
