/**
 * Sufficiency gates (protocol v2, plan §2).
 *
 * Every control this repository had before v2 verifies **integrity** — that
 * inputs are the intended bytes, and that mutation is detected. None verified
 * **sufficiency** — that the intended bytes are adequate to the task posed.
 * That gap is how a 43-artifact freeze, a 10-check kernel gate, a leakage audit
 * and four passing stubs all coexisted with a prompt that omitted the source
 * the model was required to reproduce.
 *
 * These checks are offline, free, and blocking. A sufficiency failure must
 * refuse a freeze, because the alternative is a run whose flat row of failures
 * is indistinguishable from a genuine negative result.
 */

import { estimateChangeSetTokens, estimateTokens } from "./tokens.js";
import type { SourceFile } from "./prompt.js";

export type Severity = "blocking" | "advisory";

export interface SufficiencyFinding {
  readonly check: string;
  readonly ok: boolean;
  readonly severity: Severity;
  readonly detail: string;
  readonly evidence?: Readonly<Record<string, unknown>>;
}

/* -------------------------------------------------------------------------
 * 1. Prompt completeness
 * ---------------------------------------------------------------------- */

export interface CompletenessRow {
  readonly task_id: string;
  readonly arm: string;
  readonly path: string;
  readonly source_present_in_prompt: boolean;
  readonly probe_count: number;
  readonly probes_found: number;
}

/**
 * Decides whether the source is present using several independent probes
 * rather than one.
 *
 * A single mid-file probe line is not sufficient evidence: the T1–T3 assistance
 * packets deliberately quote base-state symbols and a failing boundary, so one
 * quoted line can appear in a prompt that carries no source at all. Requiring
 * *every* probe to appear closes that hole, because a metadata packet does not
 * reproduce evenly spaced slices of the whole file.
 */
export function probeLines(source: string, count = 5): string[] {
  const candidates = source
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 12);
  if (candidates.length === 0) return [];
  const picks: string[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < count; i += 1) {
    // Evenly spaced interior slices; endpoints avoided because licence headers
    // and trailing exports are the parts most likely to be quoted elsewhere.
    const index = Math.floor(((i + 1) * candidates.length) / (count + 1));
    const line = candidates[Math.min(index, candidates.length - 1)];
    if (line !== undefined && !seen.has(line)) {
      seen.add(line);
      picks.push(line);
    }
  }
  return picks;
}

export function evaluateSourcePresence(prompt: string, source: string): { present: boolean; probes: number; found: number } {
  const probes = probeLines(source);
  if (probes.length === 0) {
    // A file with no substantial line cannot be probed. Treat as absent rather
    // than vacuously present.
    return { present: false, probes: 0, found: 0 };
  }
  const found = probes.filter((p) => prompt.includes(p)).length;
  return { present: found === probes.length, probes: probes.length, found };
}

export function checkPromptCompleteness(rows: readonly CompletenessRow[]): SufficiencyFinding {
  const absent = rows.filter((r) => !r.source_present_in_prompt);
  return {
    check: "prompt_completeness",
    ok: absent.length === 0 && rows.length > 0,
    severity: "blocking",
    detail:
      rows.length === 0
        ? "no task/arm/path combinations were checked"
        : absent.length === 0
          ? `every permitted file's source appears in its prompt (${rows.length} combinations)`
          : `${absent.length}/${rows.length} combinations omit the source the model must reproduce`,
    evidence: { rows_checked: rows.length, absent_count: absent.length, absent: absent.slice(0, 20) }
  };
}

/* -------------------------------------------------------------------------
 * 2. Output-cap headroom
 * ---------------------------------------------------------------------- */

export interface CapRow {
  readonly task_id: string;
  readonly required_output_tokens: number;
  readonly fits: boolean;
}

/**
 * Asserts every task's complete change-set envelope fits the output cap, with
 * headroom for reasoning tokens.
 *
 * In the Responses API `max_output_tokens` bounds reasoning tokens *and* answer
 * tokens together. A cap sized to the answer alone yields responses that
 * terminate incomplete before emitting a file — 0% success attributable to the
 * cap, not the model. `reasoningHeadroomTokens` is the reserve that must remain
 * after the answer.
 */
export function checkOutputCapHeadroom(
  rows: readonly CapRow[],
  maxOutputTokens: number,
  reasoningHeadroomTokens: number
): SufficiencyFinding {
  const overflowing = rows.filter((r) => !r.fits);
  const largest = rows.reduce((n, r) => Math.max(n, r.required_output_tokens), 0);
  return {
    check: "output_cap_headroom",
    ok: overflowing.length === 0 && rows.length > 0,
    severity: "blocking",
    detail:
      overflowing.length === 0
        ? `every task's change set fits ${maxOutputTokens} output tokens with ${reasoningHeadroomTokens} reserved for reasoning`
        : `${overflowing.length}/${rows.length} tasks require more output tokens than the cap allows`,
    evidence: {
      max_output_tokens: maxOutputTokens,
      reasoning_headroom_tokens: reasoningHeadroomTokens,
      largest_required_output_tokens: largest,
      minimum_defensible_cap: largest + reasoningHeadroomTokens,
      overflowing
    }
  };
}

export function requiredOutputTokens(sources: readonly SourceFile[]): number {
  return estimateChangeSetTokens(sources);
}

/* -------------------------------------------------------------------------
 * 3. Template-claim audit
 * ---------------------------------------------------------------------- */

export interface GrantedCapabilities {
  /** Tool names the transport attaches. v1 and v2 both attach none. */
  readonly tools: readonly string[];
  /** Whether prior turns are retained provider-side. */
  readonly store: boolean;
  /** Whether the prompt carries the repository source. */
  readonly sourceInPrompt: boolean;
}

interface ClaimPattern {
  readonly id: string;
  readonly pattern: RegExp;
  readonly requires: keyof GrantedCapabilities | "filesystem";
}

/**
 * Phrases that assert a capability the transport may not grant.
 *
 * v1's template said "Repository root contains the project source." under
 * `tools: []`. That sentence tells the model it has access it does not have,
 * which invites it to answer as though it had read a file it never saw. This is
 * a heuristic list and is labelled as one: a clean audit means no listed phrase
 * matched, not that the template is free of false implicature.
 */
const CLAIM_PATTERNS: readonly ClaimPattern[] = [
  { id: "repository_root_available", pattern: /repository root contains|the repository (?:is|will be) available/i, requires: "filesystem" },
  { id: "may_read_files", pattern: /you (?:can|may) (?:read|open|inspect|browse|list) (?:the |any )?files?/i, requires: "filesystem" },
  { id: "may_run_commands", pattern: /you (?:can|may) run (?:the )?(?:tests?|commands?|the suite)/i, requires: "filesystem" },
  { id: "may_search", pattern: /(?:search|grep|explore) the (?:codebase|repository|project)/i, requires: "filesystem" },
  { id: "tool_use", pattern: /use the (?:provided )?tools?|call a tool/i, requires: "tools" },
  { id: "prior_turns", pattern: /(?:as|in) (?:the |your )?(?:previous|earlier) (?:turn|message|response)/i, requires: "store" }
];

export function auditTemplateClaims(texts: readonly string[], granted: GrantedCapabilities): SufficiencyFinding {
  const joined = texts.join("\n");
  const violations: Array<{ id: string; requires: string; excerpt: string }> = [];

  for (const claim of CLAIM_PATTERNS) {
    const match = claim.pattern.exec(joined);
    if (match === null) continue;
    const satisfied =
      claim.requires === "tools"
        ? granted.tools.length > 0
        : claim.requires === "store"
          ? granted.store
          : claim.requires === "filesystem"
            ? false // no transport in this project ever grants a filesystem
            : granted.sourceInPrompt;
    if (!satisfied) {
      violations.push({ id: claim.id, requires: String(claim.requires), excerpt: match[0] });
    }
  }

  return {
    check: "template_claim_audit",
    ok: violations.length === 0,
    severity: "blocking",
    detail:
      violations.length === 0
        ? "prompt text asserts no capability the transport withholds (heuristic)"
        : `${violations.length} prompt phrase(s) assert capabilities the transport does not grant`,
    evidence: { granted, violations, is_heuristic: true }
  };
}

/* -------------------------------------------------------------------------
 * 4. Stub realism
 * ---------------------------------------------------------------------- */

export interface StubDeclaration {
  readonly name: string;
  /**
   * True only for stubs whose declared purpose requires privileged knowledge —
   * the oracle, which must hold the corrected file to prove the
   * apply-and-evaluate path at all.
   */
  readonly privileged: boolean;
  /** Whether the stub read anything from disk during the run just performed. */
  readonly readFromDisk: boolean;
  readonly purpose: string;
}

/**
 * Asserts that no unprivileged stub is better informed than the model it
 * stands in for.
 *
 * This is the generalized lesson of the v1 defect. The `oracle` and `noop`
 * stubs both ran `git show` to obtain file contents, so they held exactly what
 * the real model lacked. That is how a 20/20 PASS dry run coexisted with a
 * protocol no model could satisfy: the stubs varied the *answer* while leaving
 * the *prompt* unexamined.
 *
 * A privileged stub is still permitted — proving the apply-and-evaluate path
 * requires one — but it must be declared, and its passes may never be read as
 * evidence that the prompt is sufficient.
 */
export function checkStubRealism(declarations: readonly StubDeclaration[]): SufficiencyFinding {
  const violations = declarations.filter((d) => !d.privileged && d.readFromDisk);
  const privileged = declarations.filter((d) => d.privileged).map((d) => d.name);
  return {
    check: "stub_realism",
    ok: violations.length === 0 && declarations.length > 0,
    severity: "blocking",
    detail:
      declarations.length === 0
        ? "no stubs were declared"
        : violations.length === 0
          ? `no unprivileged stub read from disk; privileged stubs: ${privileged.join(", ") || "none"}`
          : `${violations.length} unprivileged stub(s) read from disk and are better informed than the model`,
    evidence: { declarations, violations }
  };
}

/* -------------------------------------------------------------------------
 * Aggregation
 * ---------------------------------------------------------------------- */

export interface SufficiencyReport {
  readonly schema_version: "1.0";
  readonly contacted_provider: false;
  readonly cost_usd: 0;
  readonly findings: readonly SufficiencyFinding[];
  readonly blocking_failures: number;
  readonly ok: boolean;
}

export function aggregate(findings: readonly SufficiencyFinding[]): SufficiencyReport {
  const blocking = findings.filter((f) => !f.ok && f.severity === "blocking");
  return {
    schema_version: "1.0",
    contacted_provider: false,
    cost_usd: 0,
    findings,
    blocking_failures: blocking.length,
    ok: blocking.length === 0
  };
}

/** Shared with the CLI so exit codes stay consistent across entry points. */
export const SUFFICIENCY_EXIT = {
  OK: 0,
  PROMPT_INCOMPLETE: 6,
  NOT_PROVISIONED: 7,
  OUTPUT_CAP: 8,
  TEMPLATE_CLAIM: 9,
  STUB_REALISM: 10
} as const;

export function exitCodeFor(report: SufficiencyReport): number {
  const first = report.findings.find((f) => !f.ok && f.severity === "blocking");
  switch (first?.check) {
    case undefined:
      return SUFFICIENCY_EXIT.OK;
    case "prompt_completeness":
      return SUFFICIENCY_EXIT.PROMPT_INCOMPLETE;
    case "output_cap_headroom":
      return SUFFICIENCY_EXIT.OUTPUT_CAP;
    case "template_claim_audit":
      return SUFFICIENCY_EXIT.TEMPLATE_CLAIM;
    case "stub_realism":
      return SUFFICIENCY_EXIT.STUB_REALISM;
    default:
      return 1;
  }
}

export { estimateTokens };
