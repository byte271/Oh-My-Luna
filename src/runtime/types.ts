// Runtime control boundary types — ADR 0017.
//
// These describe a deterministic, model-independent seam over the existing
// execution/policy primitives (environment.ts, process.ts, scoring.ts). Nothing
// here is model-facing, learned, or semantic. The types deliberately keep the
// per-claim status vocabulary FINER than the run receipt's coarse roll-up
// (types.ts ClaimEvaluationStatus) so that a claim is never collapsed to a single
// Boolean (mandatory principle 7).

// ---------------------------------------------------------------------------
// Execution policy — the per-run admissibility envelope.
// ---------------------------------------------------------------------------

export type SymlinkPolicy = "reject" | "reject_crossing_root";

export interface ArgvPolicy {
  mode: "exact" | "prefix" | "regex_per_arg" | "any";
  allowed_argv?: string[];
  arg_patterns?: string[];
}

export interface ExecutableRule {
  id: string;
  resolved_path_sha256: string | null;
  argv_policy: ArgvPolicy;
}

export interface ResourceBudget {
  wall_clock_ms: number;
  max_output_bytes: number;
  max_command_count: number;
  max_retries: number;
  max_generated_files: number;
  max_write_bytes: number;
  // Every resource NOT covered by an enforced field above. A disclosure, never
  // a control (mandatory principle 8). The broker refuses to pretend otherwise.
  unattested: Array<"cpu" | "memory" | "disk" | "network" | "syscalls" | "process_tree">;
}

export interface ExecutionPolicy {
  workspace_root: string;
  read_paths: string[];
  write_paths: string[];
  symlink_policy: SymlinkPolicy;
  permitted_executables: ExecutableRule[];
  environment_allowlist: string[];
  limits: ResourceBudget;
}

// ---------------------------------------------------------------------------
// Broker action requests. Every privileged action crosses one of these.
// ---------------------------------------------------------------------------

export interface WriteRequest {
  kind: "write";
  path: string; // workspace-relative
  content: string;
}

export interface ExecRequest {
  kind: "exec";
  argv: string[];
  cwd: string; // workspace-relative or absolute inside workspace_root
  stdin?: string;
  environmentAllowlist?: string[]; // must be a subset of policy.environment_allowlist
}

export type BrokerRequest = WriteRequest | ExecRequest;

// A policy decision is explicit and deterministic. `admitted:false` always
// carries a stable OML_* code, never a soft failure.
export interface PolicyDecision {
  admitted: boolean;
  code: string | null; // OML_* when admitted === false
  reason: string;
  // What the broker committed against the budget if admitted.
  budget_after?: BudgetLedger;
}

export interface BudgetLedger {
  commands_used: number;
  retries_used: number;
  files_generated: number;
  write_bytes_used: number;
}

// ---------------------------------------------------------------------------
// Evidence VM. Evidence records SEMANTICS, not command names (principle 6).
// ---------------------------------------------------------------------------

export type EvidenceType =
  | "configured_verifier_exit" // weakest: an exit code, not a proof of the claim
  | "typed_observation"
  | "content_hash"
  | "process_result";

export interface EvidenceRecord {
  evidence_id: string;
  evidence_type: EvidenceType;
  // Exact provenance of what ran — the semantics, not just a label.
  command: {
    argv: string[];
    resolved_executable: string | null;
    cwd: string;
    environment_names: string[]; // names only; never values (no secrets)
  } | null;
  exit_status: number | null;
  timed_out: boolean;
  duration_ms: number;
  stdout_sha256: string | null;
  stderr_sha256: string | null;
  // Tree/content binding: the workspace tree hash AFTER the action that produced
  // this evidence. Lets a later reader detect evidence taken against a different
  // tree (OML_EVIDENCE_TREE_MISMATCH) or before a mutation (OML_EVIDENCE_BEFORE_MUTATION).
  workspace_tree_sha256: string;
  files_affected: string[];
  captured_at: string;
  // The capability version that produced this evidence, for staleness checks.
  producer_capability_version: string | null;
}

// Per-claim status — finer than the receipt roll-up. A claim is NEVER a Boolean.
export type ClaimStatus =
  | "not_evaluated"
  | "unsupported" // no evidence depends on this claim
  | "stale" // supporting evidence predates the current tree
  | "ambiguous" // evidence is contradictory (e.g. success text + nonzero exit)
  | "failed" // evidence actively contradicts the claim
  | "supported"; // evidence exists, is fresh, and supports the claim

export interface Claim {
  claim_id: string;
  statement: string;
  // Evidence this claim explicitly depends on. A claim with no dependencies is
  // `unsupported`, not `supported` — silence is not success.
  evidence_refs: string[];
}

export interface ClaimEvaluation {
  claim_id: string;
  status: ClaimStatus;
  reason: string;
  evidence_refs: string[];
}
