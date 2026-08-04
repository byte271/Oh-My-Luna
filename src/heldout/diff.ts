/**
 * Base-versus-returned diff metadata (protocol v2, plan §3b).
 *
 * Nothing in v1 compared a returned file against the base file. The runner
 * wrote the model's whole-file output into the workspace and ran the injected
 * test; the only recorded fields were `files_changed`,
 * `unnecessary_files_changed` and `false_completion`. So an attempt failed
 * identically whether the model
 *
 *   (a) never found the bug, or
 *   (b) found and fixed it correctly, then corrupted an unrelated function
 *       while reproducing several hundred lines verbatim.
 *
 * Both land as `evaluator_exit != 0`. The distinction matters because
 * long-form verbatim reproduction is plausibly one of the things a cheap model
 * does worse than an expensive one — so attributing a transcription failure to
 * *repair* ability would bias precisely the comparison this project exists to
 * make. It gets worse, not better, once the source is supplied in the prompt.
 *
 * **These fields are diagnostic only.** Success remains exactly
 * `evaluator_exit === 0`. A diff must never create a pass, or the outcome
 * becomes author-tunable after results exist.
 *
 * The algorithm is Myers' O(ND) greedy edit script, which is fast when the edit
 * distance is small — the expected case, since the model is asked for the
 * smallest correct change. When the distance exceeds `maxEditDistance` the
 * result is reported as `truncated`, never as a small diff.
 */

export interface CitedRegion {
  /** 1-based inclusive first line, in base-file coordinates. */
  readonly start_line: number;
  /** 1-based inclusive last line, in base-file coordinates. */
  readonly end_line: number;
}

export interface DiffHunk {
  /** 1-based first base line the hunk touches (0 for a pure insertion at top). */
  readonly base_start: number;
  readonly base_lines_removed: number;
  readonly returned_lines_added: number;
}

export interface FileDiffMetrics {
  readonly path: string;
  readonly identical: boolean;
  readonly hunks_changed: number;
  readonly lines_added: number;
  readonly lines_removed: number;
  readonly base_line_count: number;
  readonly returned_line_count: number;
  /** Hunks that touch no cited region, when the arm cited any. */
  readonly changed_regions_outside_cited_regions: number;
  /** Line endings differ between base and returned content. */
  readonly line_ending_changed: boolean;
  /** Trailing-newline presence differs. */
  readonly trailing_newline_changed: boolean;
  /**
   * True when the edit distance exceeded the cap, so hunk and line counts are
   * lower bounds rather than measurements.
   */
  readonly truncated: boolean;
  readonly hunks: readonly DiffHunk[];
}

export interface DiffOptions {
  readonly citedRegions?: readonly CitedRegion[];
  readonly maxEditDistance?: number;
}

const DEFAULT_MAX_EDIT_DISTANCE = 2000;

function detectEol(text: string): "crlf" | "lf" | "none" {
  if (text.includes("\r\n")) return "crlf";
  if (text.includes("\n")) return "lf";
  return "none";
}

function splitLines(text: string): string[] {
  const normalized = text.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  // A trailing newline produces a final empty element that is not a line.
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

interface EditScript {
  readonly hunks: DiffHunk[];
  readonly added: number;
  readonly removed: number;
  readonly truncated: boolean;
}

/**
 * Myers greedy edit script, capped at `maxD`.
 *
 * Returns `truncated: true` with the counts observed so far when the cap is
 * reached, so a wholesale rewrite is reported as "too different to summarize"
 * rather than silently as a small change.
 */
function editScript(a: readonly string[], b: readonly string[], maxD: number): EditScript {
  const n = a.length;
  const m = b.length;

  // Trim the common prefix and suffix first: for a small repair inside a large
  // file this reduces the problem to a handful of lines.
  let prefix = 0;
  while (prefix < n && prefix < m && a[prefix] === b[prefix]) prefix += 1;
  let suffix = 0;
  while (suffix < n - prefix && suffix < m - prefix && a[n - 1 - suffix] === b[m - 1 - suffix]) suffix += 1;

  const aMid = a.slice(prefix, n - suffix);
  const bMid = b.slice(prefix, m - suffix);
  const nMid = aMid.length;
  const mMid = bMid.length;

  if (nMid === 0 && mMid === 0) return { hunks: [], added: 0, removed: 0, truncated: false };
  if (nMid === 0) {
    return {
      hunks: [{ base_start: prefix, base_lines_removed: 0, returned_lines_added: mMid }],
      added: mMid,
      removed: 0,
      truncated: false
    };
  }
  if (mMid === 0) {
    return {
      hunks: [{ base_start: prefix + 1, base_lines_removed: nMid, returned_lines_added: 0 }],
      added: 0,
      removed: nMid,
      truncated: false
    };
  }

  const cap = Math.min(maxD, nMid + mMid);
  const offset = cap;
  const v = new Int32Array(2 * cap + 2);
  const trace: Int32Array[] = [];

  let found = -1;
  outer: for (let d = 0; d <= cap; d += 1) {
    // Store only the k-band actually reachable at this depth.
    trace.push(v.slice(offset - d, offset + d + 1));
    for (let k = -d; k <= d; k += 2) {
      let x: number;
      const left = k - 1 + offset;
      const right = k + 1 + offset;
      if (k === -d || (k !== d && (v[left] ?? 0) < (v[right] ?? 0))) {
        x = v[right] ?? 0;
      } else {
        x = (v[left] ?? 0) + 1;
      }
      let y = x - k;
      while (x < nMid && y < mMid && aMid[x] === bMid[y]) {
        x += 1;
        y += 1;
      }
      v[k + offset] = x;
      if (x >= nMid && y >= mMid) {
        found = d;
        break outer;
      }
    }
  }

  if (found < 0) {
    // Cap reached. Report a lower bound rather than a wrong small number.
    return {
      hunks: [{ base_start: prefix + 1, base_lines_removed: nMid, returned_lines_added: mMid }],
      added: mMid,
      removed: nMid,
      truncated: true
    };
  }

  // Backtrack the trace into a list of edits, then coalesce adjacent edits into
  // hunks. Walking backwards yields edits in reverse order.
  type Edit = { readonly kind: "del" | "ins"; readonly baseIndex: number };
  const edits: Edit[] = [];
  let x = nMid;
  let y = mMid;
  for (let d = found; d > 0; d -= 1) {
    const band = trace[d];
    if (band === undefined) break;
    const bandOffset = d;
    const k = x - y;
    const leftIdx = k - 1 + bandOffset;
    const rightIdx = k + 1 + bandOffset;
    const leftVal = leftIdx >= 0 && leftIdx < band.length ? band[leftIdx] : undefined;
    const rightVal = rightIdx >= 0 && rightIdx < band.length ? band[rightIdx] : undefined;
    const takeRight = k === -d || (k !== d && (leftVal ?? -1) < (rightVal ?? -1));
    const prevK = takeRight ? k + 1 : k - 1;
    const prevX = (takeRight ? rightVal : leftVal) ?? 0;
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) {
      x -= 1;
      y -= 1;
    }
    // After the diagonal walk exactly one edit separates (x,y) from
    // (prevX,prevY): an insertion consumes b[prevY], a deletion consumes
    // a[prevX].
    edits.push(takeRight ? { kind: "ins", baseIndex: prevX } : { kind: "del", baseIndex: prevX });
    x = prevX;
    y = prevY;
  }
  edits.reverse();

  const hunks: DiffHunk[] = [];
  let added = 0;
  let removed = 0;
  let current: { start: number; del: number; ins: number } | null = null;
  let lastBase = -2;
  for (const edit of edits) {
    if (edit.kind === "ins") added += 1;
    else removed += 1;
    const at = edit.baseIndex;
    if (current !== null && at <= lastBase + 1) {
      if (edit.kind === "ins") current.ins += 1;
      else current.del += 1;
    } else {
      if (current !== null) {
        hunks.push({ base_start: prefix + current.start + 1, base_lines_removed: current.del, returned_lines_added: current.ins });
      }
      current = { start: at, del: edit.kind === "del" ? 1 : 0, ins: edit.kind === "ins" ? 1 : 0 };
    }
    lastBase = at;
  }
  if (current !== null) {
    hunks.push({ base_start: prefix + current.start + 1, base_lines_removed: current.del, returned_lines_added: current.ins });
  }

  return { hunks, added, removed, truncated: false };
}

function touchesCitedRegion(hunk: DiffHunk, regions: readonly CitedRegion[]): boolean {
  const start = hunk.base_start;
  const end = hunk.base_start + Math.max(0, hunk.base_lines_removed - 1);
  return regions.some((r) => start <= r.end_line && end >= r.start_line);
}

/**
 * Computes diagnostic diff metadata for one returned file against its base.
 */
export function diffReturnedFile(
  path: string,
  baseContents: string,
  returnedContents: string,
  options: DiffOptions = {}
): FileDiffMetrics {
  const baseLines = splitLines(baseContents);
  const returnedLines = splitLines(returnedContents);
  const regions = options.citedRegions ?? [];
  const script = editScript(baseLines, returnedLines, options.maxEditDistance ?? DEFAULT_MAX_EDIT_DISTANCE);

  return {
    path,
    identical: baseContents === returnedContents,
    hunks_changed: script.hunks.length,
    lines_added: script.added,
    lines_removed: script.removed,
    base_line_count: baseLines.length,
    returned_line_count: returnedLines.length,
    changed_regions_outside_cited_regions:
      regions.length === 0 ? 0 : script.hunks.filter((h) => !touchesCitedRegion(h, regions)).length,
    line_ending_changed: detectEol(baseContents) !== detectEol(returnedContents),
    trailing_newline_changed: baseContents.endsWith("\n") !== returnedContents.endsWith("\n"),
    truncated: script.truncated,
    hunks: script.hunks
  };
}

export interface AttemptDiffSummary {
  readonly files: readonly FileDiffMetrics[];
  readonly total_hunks: number;
  readonly total_lines_added: number;
  readonly total_lines_removed: number;
  readonly changed_regions_outside_cited_regions: number;
  /**
   * Heuristic, and labelled as one: the attempt failed *and* its edits are
   * scattered rather than local. Suggests the failure may be transcription
   * rather than repair. It is a prompt to read the receipt, not a verdict, and
   * it never affects success.
   */
  readonly unrelated_edit_suspected: boolean;
}

export interface AttemptDiffOptions {
  readonly taskSucceeded: boolean;
  /** Hunk count above which a failing attempt is flagged for inspection. */
  readonly scatterThreshold?: number;
}

export function summarizeAttemptDiff(
  files: readonly FileDiffMetrics[],
  options: AttemptDiffOptions
): AttemptDiffSummary {
  const totalHunks = files.reduce((n, f) => n + f.hunks_changed, 0);
  const outside = files.reduce((n, f) => n + f.changed_regions_outside_cited_regions, 0);
  const threshold = options.scatterThreshold ?? 3;
  const anyTruncated = files.some((f) => f.truncated);

  return {
    files,
    total_hunks: totalHunks,
    total_lines_added: files.reduce((n, f) => n + f.lines_added, 0),
    total_lines_removed: files.reduce((n, f) => n + f.lines_removed, 0),
    changed_regions_outside_cited_regions: outside,
    unrelated_edit_suspected:
      !options.taskSucceeded && (anyTruncated || totalHunks > threshold || outside > 0)
  };
}
