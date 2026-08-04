// End-to-end test for durable state + re-verification (ADR 0017, principles 7 & 9).
// Classes exercised: state/recovery AND evidence integrity, together. The core
// property demonstrated: a claim that reads `supported` at finalize is RE-DERIVED
// against the live tree by verify-run, so mutating the workspace after finalize
// turns the evidence `stale` and the claim is no longer supported. A cached green
// cannot survive here — the verdict is recomputed from evidence every time.
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { EvidenceVM, hashWorkspaceTree } from "../src/runtime/evidence.js";
import { RunStore, inspectRun, reverifyRun } from "../src/runtime/run-store.js";
import type { Claim } from "../src/runtime/types.js";
import type { CaptureExecInput } from "../src/runtime/evidence.js";

const RUN_ID = "run-e2e-1";

async function seedRun(): Promise<{ root: string; workspace: string }> {
  const root = await mkdtemp(join(tmpdir(), "oml-runstore-"));
  const workspace = await mkdtemp(join(tmpdir(), "oml-workspace-"));
  await writeFile(join(workspace, "answer.txt"), "42");
  const tree = await hashWorkspaceTree(workspace);

  const vm = new EvidenceVM();
  const capture: CaptureExecInput = {
    evidence_id: "e1",
    evidence_type: "process_result",
    argv: ["node", "-e", "0"],
    resolved_executable: process.execPath,
    cwd: workspace,
    environment_names: ["PATH"],
    exit_status: 0,
    timed_out: false,
    duration_ms: 3,
    stdout: Buffer.from("ok"),
    stderr: Buffer.from(""),
    workspace_tree_sha256: tree,
    files_affected: ["answer.txt"],
    captured_at: "1970-01-01T00:00:00.000Z",
    producer_capability_version: null
  };
  vm.capture(capture);

  const claim: Claim = { claim_id: "c1", statement: "the task produced answer.txt", evidence_refs: ["e1"] };
  const evaluation = vm.evaluateClaim(claim, tree);
  assert.equal(evaluation.status, "supported");

  const store = new RunStore(root, RUN_ID);
  await store.writeManifest({
    run_id: RUN_ID,
    workspace_root: workspace,
    finalize_tree_sha256: tree,
    state: "finalized"
  });
  await store.writeEvidence(vm.records);
  await store.writeClaims([claim]);
  await store.writeEvaluations([evaluation]);
  return { root, workspace };
}

test("inspect-run reads back exactly what was recorded", async () => {
  const { root } = await seedRun();
  const inspected = await inspectRun(root, RUN_ID);
  assert.equal(inspected.manifest.run_id, RUN_ID);
  assert.equal(inspected.evidence.length, 1);
  assert.equal(inspected.claims[0]?.claim_id, "c1");
  assert.equal(inspected.evaluations_at_finalize[0]?.status, "supported");
});

test("verify-run confirms every claim against an UNCHANGED tree", async () => {
  const { root } = await seedRun();
  const result = await reverifyRun(root, RUN_ID);
  assert.equal(result.tree_changed, false);
  assert.equal(result.all_supported_now, true);
  assert.equal(result.regressions.length, 0);
});

test("verify-run turns a finalized-supported claim STALE after a tree mutation", async () => {
  const { root, workspace } = await seedRun();
  // Mutate the workspace after finalize. The evidence is bound to the old tree.
  await writeFile(join(workspace, "answer.txt"), "99");
  const result = await reverifyRun(root, RUN_ID);
  assert.equal(result.tree_changed, true);
  assert.equal(result.all_supported_now, false);
  assert.equal(result.reevaluations[0]?.status, "stale");
  assert.equal(result.regressions[0]?.claim_id, "c1");
  assert.equal(result.regressions[0]?.now, "stale");
});

test("verify-run with --require-strong rejects a verifier-exit-only claim", async () => {
  const root = await mkdtemp(join(tmpdir(), "oml-runstore-"));
  const workspace = await mkdtemp(join(tmpdir(), "oml-workspace-"));
  await writeFile(join(workspace, "answer.txt"), "42");
  const tree = await hashWorkspaceTree(workspace);
  const vm = new EvidenceVM();
  vm.capture({
    evidence_id: "e1",
    evidence_type: "configured_verifier_exit",
    argv: ["verifier"],
    resolved_executable: null,
    cwd: workspace,
    environment_names: [],
    exit_status: 0,
    timed_out: false,
    duration_ms: 1,
    stdout: Buffer.from(""),
    stderr: Buffer.from(""),
    workspace_tree_sha256: tree,
    files_affected: [],
    captured_at: "1970-01-01T00:00:00.000Z",
    producer_capability_version: null
  });
  const claim: Claim = { claim_id: "c1", statement: "verifier passed", evidence_refs: ["e1"] };
  const store = new RunStore(root, RUN_ID);
  await store.writeManifest({ run_id: RUN_ID, workspace_root: workspace, finalize_tree_sha256: tree, state: "finalized" });
  await store.writeEvidence(vm.records);
  await store.writeClaims([claim]);
  await store.writeEvaluations([vm.evaluateClaim(claim, tree)]);

  const strong = await reverifyRun(root, RUN_ID, { requireStrongEvidence: true });
  assert.equal(strong.all_supported_now, false);
  assert.equal(strong.reevaluations[0]?.status, "unsupported");

  const weak = await reverifyRun(root, RUN_ID, { requireStrongEvidence: false });
  assert.equal(weak.all_supported_now, true);
});
