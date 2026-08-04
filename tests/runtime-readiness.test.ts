// Adversarial tests for the readiness surfaces (ADR 0017, principle 5).
// Class exercised: prompt / context sufficiency, plus boundary disclosure. The
// key property is separation: a GREEN doctor must NOT imply provider auth, a
// valid verifier, task solvability, or an OS sandbox — each surface enumerates
// what it does NOT prove. Sufficiency measures whether the model was GIVEN the
// inputs it needs, distinct from whether the task is solvable.
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { doctor, sufficiency, smoke } from "../src/runtime/readiness.js";

// --- doctor: installation only ----------------------------------------------

test("doctor is green on a supported host but disclaims what it does not prove", async () => {
  const root = await mkdtemp(join(tmpdir(), "oml-doctor-"));
  const result = await doctor({ probeWritableDir: root });
  assert.equal(result.surface, "doctor");
  assert.equal(result.ready, true);
  // The disclosure is the whole point: doctor must not imply these.
  for (const claim of ["provider_auth", "a_model_call_succeeds", "task_is_solvable", "prompt_is_sufficient", "an_os_sandbox_contains_the_process"]) {
    assert.ok(result.implies_not.includes(claim), `doctor should disclaim ${claim}`);
  }
});

// --- sufficiency: given-the-inputs, not solvable -----------------------------

test("sufficiency fails when a required path was not provided", async () => {
  const root = await mkdtemp(join(tmpdir(), "oml-suff-"));
  const present = join(root, "given.txt");
  await writeFile(present, "x");
  const result = await sufficiency({
    required_paths: [present, join(root, "missing.txt")],
    provided_paths: [present]
  });
  assert.equal(result.ready, false);
  const missing = result.checks.find((c) => c.id === "required_paths_provided");
  assert.equal(missing?.ok, false);
});

test("sufficiency flags a task that cannot be satisfied without tools it was not given", async () => {
  const root = await mkdtemp(join(tmpdir(), "oml-suff-"));
  const present = join(root, "given.txt");
  await writeFile(present, "x");
  const result = await sufficiency({
    required_paths: [present],
    provided_paths: [present],
    unsatisfiable_without_tools: ["network_fetch"]
  });
  assert.equal(result.ready, false);
  const tools = result.checks.find((c) => c.id === "unsatisfiable_without_tools");
  assert.equal(tools?.ok, false);
});

test("sufficiency is green only when required inputs are present and readable", async () => {
  const root = await mkdtemp(join(tmpdir(), "oml-suff-"));
  const present = join(root, "given.txt");
  await writeFile(present, "x");
  const result = await sufficiency({ required_paths: [present], provided_paths: [present] });
  assert.equal(result.ready, true);
});

test("sufficiency disclaims that presence implies solvability", async () => {
  const root = await mkdtemp(join(tmpdir(), "oml-suff-"));
  const present = join(root, "given.txt");
  await writeFile(present, "x");
  const result = await sufficiency({ required_paths: [present], provided_paths: [present] });
  assert.ok(result.implies_not.includes("task_is_solvable"));
});

// --- smoke: execution seam, offline -----------------------------------------

test("smoke drives a real write and a real process end to end, offline", async () => {
  const root = await mkdtemp(join(tmpdir(), "oml-smoke-"));
  const result = await smoke({ workspaceRoot: root, executablePath: process.execPath });
  assert.equal(result.surface, "smoke");
  assert.equal(result.ready, true, JSON.stringify(result.checks));
  assert.ok(result.checks.find((c) => c.id === "broker_exec_process")?.ok);
  assert.ok(result.checks.find((c) => c.id === "command_budget_committed")?.ok);
});

test("smoke disclaims provider auth and OS containment even when green", async () => {
  const root = await mkdtemp(join(tmpdir(), "oml-smoke-"));
  const result = await smoke({ workspaceRoot: root, executablePath: process.execPath });
  assert.ok(result.implies_not.includes("provider_auth"));
  assert.ok(result.implies_not.includes("an_os_sandbox_contains_the_process"));
});
