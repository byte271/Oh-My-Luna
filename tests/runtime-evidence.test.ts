// Adversarial tests for the Evidence VM (ADR 0017, principles 6 & 7).
// Class exercised: evidence integrity. The central defense is that an exit code
// is NOT a proof: a "verifier passed" claim backed only by a configured-verifier
// exit is reported as unsupported when strong evidence is required. Evidence is
// also bound to a workspace tree hash, so evidence taken against a different tree
// cannot silently support a claim.
import assert from "node:assert/strict";
import { mkdtemp, symlink, unlink, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { EvidenceVM, hashWorkspaceTree } from "../src/runtime/evidence.js";
import { OmlError } from "../src/errors.js";
import type { CaptureExecInput } from "../src/runtime/evidence.js";
import type { Claim, EvidenceType } from "../src/runtime/types.js";
import { SKIP_IF_NO_SYMLINK } from "./symlink-probe.js";

const TREE_A = "tree-hash-aaaa";
const TREE_B = "tree-hash-bbbb";

function cap(patch: Partial<CaptureExecInput> & { evidence_id: string }): CaptureExecInput {
  return {
    evidence_type: "process_result" as EvidenceType,
    argv: ["node", "-e", "0"],
    resolved_executable: "/usr/bin/node",
    cwd: "/w",
    environment_names: ["PATH"],
    exit_status: 0,
    timed_out: false,
    duration_ms: 5,
    stdout: Buffer.from(""),
    stderr: Buffer.from(""),
    workspace_tree_sha256: TREE_A,
    files_affected: [],
    captured_at: "1970-01-01T00:00:00.000Z",
    producer_capability_version: null,
    ...patch
  };
}

function claim(evidence_refs: string[]): Claim {
  return { claim_id: "c1", statement: "the task is complete", evidence_refs };
}
// --- the false-green class --------------------------------------------------

test("a claim backed only by a verifier exit is UNSUPPORTED when strong evidence is required", () => {
  const vm = new EvidenceVM();
  vm.capture(cap({ evidence_id: "e1", evidence_type: "configured_verifier_exit", exit_status: 0 }));
  const result = vm.evaluateClaim(claim(["e1"]), TREE_A, { requireStrongEvidence: true });
  assert.equal(result.status, "unsupported");
  assert.match(result.reason, /stronger evidence required/);
});

test("the same verifier-exit claim is only WEAKLY supported without the strong-evidence flag", () => {
  const vm = new EvidenceVM();
  vm.capture(cap({ evidence_id: "e1", evidence_type: "configured_verifier_exit", exit_status: 0 }));
  const result = vm.evaluateClaim(claim(["e1"]), TREE_A);
  assert.equal(result.status, "supported");
  assert.match(result.reason, /configured verifier exit only/);
});

// --- evidence-against-a-different-tree (stale) ------------------------------

test("evidence bound to a different tree is STALE, not supporting", () => {
  const vm = new EvidenceVM();
  vm.capture(cap({ evidence_id: "e1", workspace_tree_sha256: TREE_A }));
  const result = vm.evaluateClaim(claim(["e1"]), TREE_B);
  assert.equal(result.status, "stale");
});

// --- contradiction & failure -----------------------------------------------

test("a nonzero exit makes the claim FAILED", () => {
  const vm = new EvidenceVM();
  vm.capture(cap({ evidence_id: "e1", exit_status: 1 }));
  const result = vm.evaluateClaim(claim(["e1"]), TREE_A);
  assert.equal(result.status, "failed");
});

test("a timeout with a zero exit is AMBIGUOUS, never a pass", () => {
  const vm = new EvidenceVM();
  vm.capture(cap({ evidence_id: "e1", timed_out: true, exit_status: 0 }));
  const result = vm.evaluateClaim(claim(["e1"]), TREE_A);
  assert.equal(result.status, "ambiguous");
});

// --- silence is not success -------------------------------------------------

test("a claim with no evidence dependencies is UNSUPPORTED", () => {
  const vm = new EvidenceVM();
  const result = vm.evaluateClaim(claim([]), TREE_A);
  assert.equal(result.status, "unsupported");
  assert.match(result.reason, /no evidence dependencies/);
});

test("a claim referencing missing evidence is UNSUPPORTED", () => {
  const vm = new EvidenceVM();
  const result = vm.evaluateClaim(claim(["nope"]), TREE_A);
  assert.equal(result.status, "unsupported");
  assert.match(result.reason, /evidence not found/);
});

test("fresh, strong, zero-exit evidence SUPPORTS the claim", () => {
  const vm = new EvidenceVM();
  vm.capture(cap({ evidence_id: "e1", evidence_type: "process_result", exit_status: 0 }));
  const result = vm.evaluateClaim(claim(["e1"]), TREE_A);
  assert.equal(result.status, "supported");
});

// --- append-only integrity --------------------------------------------------

test("capturing a duplicate evidence id is refused", () => {
  const vm = new EvidenceVM();
  vm.capture(cap({ evidence_id: "e1" }));
  assert.throws(
    () => vm.capture(cap({ evidence_id: "e1" })),
    (error: unknown) => error instanceof OmlError && error.code === "OML_INTERNAL"
  );
});

// --- roll-up to the receipt vocabulary --------------------------------------

test("rollUp reports partially_evaluated when some claims are undecided", () => {
  const vm = new EvidenceVM();
  vm.capture(cap({ evidence_id: "e1", exit_status: 0 }));
  const decided = vm.evaluateClaim(claim(["e1"]), TREE_A);
  const undecided = { claim_id: "c2", status: "not_evaluated" as const, reason: "n/a", evidence_refs: [] };
  const rolled = vm.rollUp([decided, undecided]);
  assert.equal(rolled.status, "partially_evaluated");
  assert.equal(rolled.evaluated_claim_count, 1);
  assert.equal(rolled.total_claim_count, 2);
});

// --- tree hashing is content-sensitive --------------------------------------

test("hashWorkspaceTree changes when file content changes", async () => {
  const root = await mkdtemp(join(tmpdir(), "oml-tree-"));
  await writeFile(join(root, "a.txt"), "one");
  const first = await hashWorkspaceTree(root);
  await writeFile(join(root, "a.txt"), "two");
  const second = await hashWorkspaceTree(root);
  assert.notEqual(first, second);
});

test("hashWorkspaceTree changes when a file is added or removed", async () => {
  const root = await mkdtemp(join(tmpdir(), "oml-tree-"));
  await writeFile(join(root, "a.txt"), "one");
  const before = await hashWorkspaceTree(root);
  await writeFile(join(root, "b.txt"), "two");
  const added = await hashWorkspaceTree(root);
  assert.notEqual(before, added);
  await rm(join(root, "b.txt"));
  const afterRemove = await hashWorkspaceTree(root);
  assert.equal(afterRemove, before);
});

// A symlink swap between two EXISTING targets must still change the hash. This is
// the adversarial case: if the tree hash only recorded "target-exists", swapping
// the link would go unnoticed and stale evidence could read as fresh.
test("hashWorkspaceTree changes when a symlink is re-pointed between existing targets", { skip: SKIP_IF_NO_SYMLINK }, async () => {
  const root = await mkdtemp(join(tmpdir(), "oml-tree-"));
  await writeFile(join(root, "x.txt"), "x");
  await writeFile(join(root, "y.txt"), "y");
  await symlink("x.txt", join(root, "link"));
  const pointingX = await hashWorkspaceTree(root);
  await unlink(join(root, "link"));
  await symlink("y.txt", join(root, "link"));
  const pointingY = await hashWorkspaceTree(root);
  assert.notEqual(pointingX, pointingY);
});
