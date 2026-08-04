// Durable run store + re-verification — ADR 0017, principles 7 & 9.
//
// A run's evidence, claims, evaluations, and lifecycle state are persisted under
// .oml/runs/<runId>/ via the atomic, hash-checked writer in state.ts. The store
// is the seam that makes two mission-critical operations possible AFTER a run:
//
//   inspect-run  — read back exactly what was recorded (no re-derivation).
//   verify-run   — RE-DERIVE each claim's status against the CURRENT workspace
//                  tree. If the tree changed since finalize, evidence bound to
//                  the old tree becomes `stale`; a claim that read as supported
//                  at finalize can therefore read as unsupported now. This is the
//                  opposite of a cached boolean: the verdict is recomputed from
//                  evidence semantics every time, so a false green cannot persist.
//
// The manifest records the workspace_root and the finalize-time tree hash so a
// later reader can detect drift without trusting the run's own summary.

import { readFile } from "node:fs/promises";
import { EvidenceVM, hashWorkspaceTree } from "./evidence.js";
import { readStateFile, statePath, writeStateFile, type RunState } from "./state.js";
import type { Claim, ClaimEvaluation, EvidenceRecord } from "./types.js";
import type { JsonValue } from "../types.js";

export interface RunManifest {
  run_id: string;
  workspace_root: string;
  finalize_tree_sha256: string | null;
  state: RunState;
}

const FILES = {
  manifest: "manifest.json",
  evidence: "evidence.json",
  claims: "claims.json",
  evaluations: "evaluations.json"
} as const;

export class RunStore {
  readonly #root: string;
  readonly #runId: string;

  constructor(root: string, runId: string) {
    this.#root = root;
    this.#runId = runId;
  }

  #path(name: string): string {
    return statePath(this.#root, this.#runId, name);
  }

  async writeManifest(manifest: RunManifest): Promise<void> {
    await writeStateFile(this.#path(FILES.manifest), manifest as unknown as JsonValue);
  }

  async readManifest(): Promise<RunManifest> {
    return (await readStateFile(this.#path(FILES.manifest))) as unknown as RunManifest;
  }

  async writeEvidence(records: readonly EvidenceRecord[]): Promise<void> {
    await writeStateFile(this.#path(FILES.evidence), { records } as unknown as JsonValue);
  }

  async readEvidence(): Promise<EvidenceRecord[]> {
    const body = (await readStateFile(this.#path(FILES.evidence))) as unknown as { records: EvidenceRecord[] };
    return body.records;
  }

  async writeClaims(claims: readonly Claim[]): Promise<void> {
    await writeStateFile(this.#path(FILES.claims), { claims } as unknown as JsonValue);
  }

  async readClaims(): Promise<Claim[]> {
    const body = (await readStateFile(this.#path(FILES.claims))) as unknown as { claims: Claim[] };
    return body.claims;
  }

  async writeEvaluations(evaluations: readonly ClaimEvaluation[]): Promise<void> {
    await writeStateFile(this.#path(FILES.evaluations), { evaluations } as unknown as JsonValue);
  }

  async readEvaluations(): Promise<ClaimEvaluation[]> {
    const body = (await readStateFile(this.#path(FILES.evaluations))) as unknown as { evaluations: ClaimEvaluation[] };
    return body.evaluations;
  }
}
export interface InspectResult {
  manifest: RunManifest;
  evidence: EvidenceRecord[];
  claims: Claim[];
  evaluations_at_finalize: ClaimEvaluation[];
}

// Read back what was recorded, with NO re-derivation. Faithful to the store.
export async function inspectRun(root: string, runId: string): Promise<InspectResult> {
  const store = new RunStore(root, runId);
  return {
    manifest: await store.readManifest(),
    evidence: await store.readEvidence(),
    claims: await store.readClaims(),
    evaluations_at_finalize: await store.readEvaluations()
  };
}

export interface ReverifyResult {
  run_id: string;
  current_tree_sha256: string;
  finalize_tree_sha256: string | null;
  tree_changed: boolean;
  // Re-derived now, claim-by-claim, against the CURRENT tree.
  reevaluations: ClaimEvaluation[];
  // A claim that read `supported` at finalize but does not read `supported` now.
  regressions: Array<{ claim_id: string; was: string; now: string }>;
  // True only if EVERY claim still reads `supported` against the current tree.
  all_supported_now: boolean;
}

// Re-derive every claim's status against the CURRENT workspace tree. This is the
// anti-false-green operation: a verdict is never cached, it is recomputed from
// persisted evidence semantics whenever asked. Requiring strong evidence here
// means a claim resting only on a verifier exit does not re-verify as supported.
export async function reverifyRun(
  root: string,
  runId: string,
  options: { requireStrongEvidence?: boolean } = {}
): Promise<ReverifyResult> {
  const store = new RunStore(root, runId);
  const manifest = await store.readManifest();
  const evidence = await store.readEvidence();
  const claims = await store.readClaims();
  const finalizeEvaluations = await store.readEvaluations();

  const vm = new EvidenceVM();
  vm.restore(evidence);

  const currentTree = await hashWorkspaceTree(manifest.workspace_root);
  const reevaluations = claims.map((claim) =>
    vm.evaluateClaim(claim, currentTree, {
      ...(options.requireStrongEvidence === undefined ? {} : { requireStrongEvidence: options.requireStrongEvidence })
    })
  );

  const priorStatus = new Map(finalizeEvaluations.map((evaluation) => [evaluation.claim_id, evaluation.status]));
  const regressions = reevaluations
    .filter((evaluation) => priorStatus.get(evaluation.claim_id) === "supported" && evaluation.status !== "supported")
    .map((evaluation) => ({
      claim_id: evaluation.claim_id,
      was: "supported",
      now: evaluation.status
    }));

  return {
    run_id: runId,
    current_tree_sha256: currentTree,
    finalize_tree_sha256: manifest.finalize_tree_sha256,
    tree_changed: manifest.finalize_tree_sha256 !== null && manifest.finalize_tree_sha256 !== currentTree,
    reevaluations,
    regressions,
    all_supported_now: reevaluations.length > 0 && reevaluations.every((evaluation) => evaluation.status === "supported")
  };
}
