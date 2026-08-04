import { basename, dirname, isAbsolute, normalize, relative, resolve, sep } from "node:path";
import { realpath } from "node:fs/promises";

/**
 * Change-set validation for protocol v2.
 *
 * Supersedes `src/providers/output-validation.ts`, which is pinned by the v1
 * freeze and therefore cannot be corrected in place. The governing rule is
 * unchanged and carried forward: a fluent natural-language answer claiming the
 * task is done, but carrying no applicable change, is a FAILED attempt.
 *
 * Four defects in the v1 validator are corrected here:
 *
 * 1. **Fail-open on an empty permitted set.** v1 guarded the membership test
 *    with `permitted.size > 0`, so a task whose `permitted_paths` was empty or
 *    malformed accepted writes to *any* non-escaping path. The permitted set is
 *    the only thing standing between a model and the evaluator, so its absence
 *    must fail closed, not open.
 *
 * 2. **Duplicate paths silently collapsed.** v1 accepted the same path twice
 *    with different contents; the workspace kept whichever was written last and
 *    `files_changed` double-counted it. Ambiguity about what was evaluated is
 *    rejected rather than resolved by write order.
 *
 * 3. **Platform-specific absolute paths.** `isAbsolute` is platform-dependent,
 *    so `C:\evaluator.py` and `\\host\share\x` are not absolute when the harness
 *    runs on Linux. They are rejected explicitly.
 *
 * 4. **No containment check against symlinks.** Stage A links the shared base
 *    worktree's `node_modules` into each attempt's workspace to avoid a
 *    per-attempt install. A write through that link escapes the disposable
 *    workspace and lands in state shared by every later attempt.
 *    `assertContainedTarget` resolves symlinks before writing.
 */

export type ChangeSetRejection =
  | "response_incomplete"
  | "response_not_completed"
  | "no_output_text"
  | "output_too_large"
  | "not_json"
  | "no_files_array"
  | "empty_change_set"
  | "invalid_file_entry"
  | "duplicate_path"
  | "path_not_permitted"
  | "path_escapes_workspace"
  | "no_permitted_paths_declared";

export interface ChangeSetFile {
  readonly path: string;
  readonly contents: string;
}

export type ChangeSetVerdict =
  | { readonly ok: true; readonly files: readonly ChangeSetFile[] }
  | { readonly ok: false; readonly reason: ChangeSetRejection; readonly detail: string };

export interface ChangeSetOptions {
  readonly status: string | null;
  readonly incompleteReason: string | null;
  readonly maxBytes: number;
  /**
   * Paths the task permits. Must be non-empty: an empty declaration is a
   * malformed task, not a permissive one.
   */
  readonly permittedPaths: readonly string[];
}

/** Rejects drive-qualified and UNC paths regardless of the host platform. */
function isForeignAbsolute(raw: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(raw) || raw.startsWith("\\\\") || raw.startsWith("//");
}

/** Control characters and NUL cannot appear in a repository-relative path. */
const CONTROL_CHARS = /[\u0000-\u001f]/;

export function validateChangeSet(text: string, options: ChangeSetOptions): ChangeSetVerdict {
  if (options.permittedPaths.length === 0) {
    return {
      ok: false,
      reason: "no_permitted_paths_declared",
      detail: "task declares no permitted paths; refusing to accept any write"
    };
  }

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
  const seen = new Set<string>();
  const files: ChangeSetFile[] = [];

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
    if (raw.length === 0 || CONTROL_CHARS.test(raw)) {
      return { ok: false, reason: "invalid_file_entry", detail: "path is empty or contains control characters" };
    }
    if (isAbsolute(raw) || isForeignAbsolute(raw)) {
      return { ok: false, reason: "path_escapes_workspace", detail: raw };
    }
    const path = normalize(raw);
    if (path === ".." || path.startsWith(`..${sep}`) || path.startsWith("../")) {
      return { ok: false, reason: "path_escapes_workspace", detail: raw };
    }
    if (!permitted.has(path)) {
      return { ok: false, reason: "path_not_permitted", detail: path };
    }
    if (seen.has(path)) {
      return { ok: false, reason: "duplicate_path", detail: path };
    }
    seen.add(path);
    files.push({ path, contents: (entry as { contents: string }).contents });
  }

  return { ok: true, files };
}

export class ContainmentError extends Error {
  readonly attemptedPath: string;
  readonly resolvedPath: string;
  constructor(attemptedPath: string, resolvedPath: string) {
    super(`write target escapes the workspace: ${attemptedPath} resolves to ${resolvedPath}`);
    this.name = "ContainmentError";
    this.attemptedPath = attemptedPath;
    this.resolvedPath = resolvedPath;
  }
}

/**
 * Asserts that writing `relPath` inside `workspace` cannot escape it through a
 * symlink, and returns the absolute target.
 *
 * Resolves the deepest existing ancestor — the file itself may not exist yet —
 * and requires the real path to remain inside the real workspace. A path
 * traversing `node_modules` (a link to shared state) fails here even though it
 * passes the textual checks in `validateChangeSet`.
 */
export async function assertContainedTarget(workspace: string, relPath: string): Promise<string> {
  const realWorkspace = await realpath(workspace);
  const target = resolve(realWorkspace, relPath);

  // Walk up to the deepest ancestor that exists on disk. Everything below it is
  // yet to be created and so cannot itself be a link.
  const pending: string[] = [];
  let probe = target;
  let realAncestor: string | null = null;
  for (;;) {
    realAncestor = await realpath(probe).catch(() => null);
    if (realAncestor !== null) break;
    const parent = dirname(probe);
    if (parent === probe) break;
    pending.unshift(basename(probe));
    probe = parent;
  }
  if (realAncestor === null) throw new ContainmentError(relPath, target);

  const full = pending.length === 0 ? realAncestor : resolve(realAncestor, ...pending);
  const rel = relative(realWorkspace, full);
  if (rel === "" || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new ContainmentError(relPath, full);
  }
  return full;
}
