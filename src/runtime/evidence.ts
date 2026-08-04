// Evidence VM — ADR 0017, mandatory principles 6 and 7.
//
// This is the machinery that makes a false green auditable. It records evidence
// SEMANTICS (exact command, resolved executable, cwd, env names, exit status,
// output digests, tree hash, files affected) rather than a command name, and it
// evaluates claims against explicit evidence dependencies without ever collapsing
// a claim to a single Boolean.
//
// Two distinctions it enforces:
//   1. configured_verifier_exit is the WEAKEST evidence type. An exit code is not
//      a proof the claim holds. A claim supported ONLY by a verifier exit is
//      reported as such, and the caller can require stronger evidence.
//   2. Evidence is bound to the workspace tree hash at capture time. Evidence
//      taken before a mutation (OML_EVIDENCE_BEFORE_MUTATION) or against a
//      different tree (OML_EVIDENCE_TREE_MISMATCH) cannot silently support a claim.

import { readdir, readFile, readlink, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { canonicalJson, sha256 } from "../canonical.js";
import { OmlError } from "../errors.js";
import { direntParent } from "../dirent.js";
import type {
  Claim,
  ClaimEvaluation,
  ClaimStatus,
  EvidenceRecord,
  EvidenceType
} from "./types.js";

// Deterministic hash of a workspace tree: sorted (relative path, content hash)
// pairs. Symlinks are recorded by their own target (read, not followed) plus
// whether that target currently exists, so re-pointing a link — even between two
// existing targets — changes the tree hash. Directories contribute their path only.
export async function hashWorkspaceTree(root: string): Promise<string> {
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  const rows: Array<[string, string]> = [];
  for (const entry of entries) {
    const parent = direntParent(entry, root);
    const absolute = join(parent, entry.name);
    const rel = relative(root, absolute).replaceAll("\\", "/");
    if (entry.isSymbolicLink()) {
      // Record the link's OWN target (via readlink, not followed) so that
      // re-pointing a symlink changes the tree hash even when both the old and
      // new targets exist. Existence is appended so a dangling link stays
      // distinguishable from a live one. Following the link instead would let a
      // swap between two existing targets pass unnoticed.
      const target = (await readlink(absolute).catch(() => "")).replaceAll("\\", "/");
      const info = await stat(absolute).catch(() => null);
      rows.push([rel, `symlink:${info ? "target-exists" : "dangling"}:${target}`]);
    } else if (entry.isFile()) {
      rows.push([rel, sha256(await readFile(absolute))]);
    } else if (entry.isDirectory()) {
      rows.push([rel, "dir"]);
    }
  }
  rows.sort(([a], [b]) => a.localeCompare(b));
  return sha256(canonicalJson(rows as unknown as never));
}

// Evidence that is not strong enough to support a claim on its own.
const WEAK_EVIDENCE: ReadonlySet<EvidenceType> = new Set<EvidenceType>(["configured_verifier_exit"]);

export interface CaptureExecInput {
  evidence_id: string;
  evidence_type: EvidenceType;
  argv: string[];
  resolved_executable: string | null;
  cwd: string;
  environment_names: string[];
  exit_status: number | null;
  timed_out: boolean;
  duration_ms: number;
  stdout: Buffer;
  stderr: Buffer;
  workspace_tree_sha256: string;
  files_affected: string[];
  captured_at: string;
  producer_capability_version: string | null;
}

// The VM is append-only within a run. It never mutates a captured record.
export class EvidenceVM {
  readonly #records: EvidenceRecord[] = [];

  capture(input: CaptureExecInput): EvidenceRecord {
    const record: EvidenceRecord = {
      evidence_id: input.evidence_id,
      evidence_type: input.evidence_type,
      command: {
        argv: input.argv,
        resolved_executable: input.resolved_executable,
        cwd: input.cwd,
        environment_names: [...input.environment_names].sort()
      },
      exit_status: input.exit_status,
      timed_out: input.timed_out,
      duration_ms: input.duration_ms,
      stdout_sha256: sha256(input.stdout),
      stderr_sha256: sha256(input.stderr),
      workspace_tree_sha256: input.workspace_tree_sha256,
      files_affected: [...input.files_affected].sort(),
      captured_at: input.captured_at,
      producer_capability_version: input.producer_capability_version
    };
    if (this.#records.some((existing) => existing.evidence_id === record.evidence_id)) {
      throw new OmlError("OML_INTERNAL", "duplicate evidence id", { evidence_id: record.evidence_id });
    }
    this.#records.push(record);
    return record;
  }

  get records(): readonly EvidenceRecord[] {
    return this.#records;
  }

  // Rehydrate a VM from persisted records (for verify-run). Re-checks id
  // uniqueness so a tampered store with duplicate ids is rejected on load.
  restore(records: readonly EvidenceRecord[]): void {
    for (const record of records) {
      if (this.#records.some((existing) => existing.evidence_id === record.evidence_id)) {
        throw new OmlError("OML_INTERNAL", "duplicate evidence id on restore", { evidence_id: record.evidence_id });
      }
      this.#records.push(record);
    }
  }

  find(id: string): EvidenceRecord | undefined {
    return this.#records.find((record) => record.evidence_id === id);
  }

  // Evaluate one claim against the CURRENT tree. currentTreeSha256 is the tree
  // hash at claim-evaluation time; evidence bound to a different tree is stale.
  evaluateClaim(
    claim: Claim,
    currentTreeSha256: string,
    options: { requireStrongEvidence?: boolean } = {}
  ): ClaimEvaluation {
    if (claim.evidence_refs.length === 0) {
      return {
        claim_id: claim.claim_id,
        status: "unsupported",
        reason: "claim declares no evidence dependencies",
        evidence_refs: []
      };
    }
    const resolved = claim.evidence_refs.map((ref) => this.find(ref));
    const missing = claim.evidence_refs.filter((ref, index) => resolved[index] === undefined);
    if (missing.length > 0) {
      return {
        claim_id: claim.claim_id,
        status: "unsupported",
        reason: `evidence not found: ${missing.join(", ")}`,
        evidence_refs: claim.evidence_refs
      };
    }
    const evidence = resolved as EvidenceRecord[];

    // Stale: any supporting evidence bound to a tree other than the current one.
    const stale = evidence.filter((record) => record.workspace_tree_sha256 !== currentTreeSha256);
    if (stale.length > 0) {
      return {
        claim_id: claim.claim_id,
        status: "stale",
        reason: `evidence predates current tree: ${stale.map((record) => record.evidence_id).join(", ")}`,
        evidence_refs: claim.evidence_refs
      };
    }

    // Ambiguous: contradictory signals. Success-looking stdout with a nonzero
    // exit, or failure-looking stdout with a zero exit, cannot support a claim.
    const ambiguous = evidence.find((record) => contradictory(record));
    if (ambiguous) {
      return {
        claim_id: claim.claim_id,
        status: "ambiguous",
        reason: `evidence ${ambiguous.evidence_id} has contradictory exit status and output`,
        evidence_refs: claim.evidence_refs
      };
    }

    // Failed: any dependency reports a nonzero/timeout terminal state.
    const failed = evidence.find((record) => record.timed_out || (record.exit_status ?? 1) !== 0);
    if (failed) {
      return {
        claim_id: claim.claim_id,
        status: "failed",
        reason: `evidence ${failed.evidence_id} did not succeed`,
        evidence_refs: claim.evidence_refs
      };
    }

    // Weak: if the ONLY evidence is a configured-verifier exit and the caller
    // requires strong evidence, the claim is not supported. A verifier exit is
    // not a proof of the claim (principle 6).
    const allWeak = evidence.every((record) => WEAK_EVIDENCE.has(record.evidence_type));
    if (allWeak && options.requireStrongEvidence) {
      return {
        claim_id: claim.claim_id,
        status: "unsupported",
        reason: "only configured_verifier_exit evidence; stronger evidence required",
        evidence_refs: claim.evidence_refs
      };
    }

    return {
      claim_id: claim.claim_id,
      status: "supported",
      reason: allWeak ? "supported by configured verifier exit only" : "supported by fresh non-contradictory evidence",
      evidence_refs: claim.evidence_refs
    };
  }

  // Roll finer per-claim statuses up to the receipt's coarse vocabulary, without
  // losing the detail (the ClaimEvaluation array is retained alongside).
  rollUp(evaluations: ClaimEvaluation[]): {
    status: "not_evaluated" | "partially_evaluated" | "evaluated";
    evaluated_claim_count: number;
    total_claim_count: number;
  } {
    const total = evaluations.length;
    const decided: ClaimStatus[] = ["supported", "failed", "ambiguous", "stale", "unsupported"];
    const evaluated = evaluations.filter((evaluation) => decided.includes(evaluation.status)).length;
    let status: "not_evaluated" | "partially_evaluated" | "evaluated";
    if (evaluated === 0) status = "not_evaluated";
    else if (evaluated < total) status = "partially_evaluated";
    else status = "evaluated";
    return { status, evaluated_claim_count: evaluated, total_claim_count: total };
  }
}

function contradictory(record: EvidenceRecord): boolean {
  // We can only reason over what we captured: exit status plus output digests.
  // A record cannot both be a clean success and carry a nonzero/timeout exit.
  // (Text-pattern contradiction — "PASSED" in stdout with a nonzero exit — is
  // evaluated by the caller supplying a typed_observation; the VM does not parse
  // free text here, by design, to avoid a fragile grep becoming a trust anchor.)
  if (record.timed_out && (record.exit_status ?? 0) === 0) return true;
  return false;
}
