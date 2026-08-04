// Adversarial tests for durable runtime state (ADR 0017, principle 9).
// Class exercised: state / recovery. A torn or tampered state file is a HARD
// error, never a silent best-effort recovery; the run lifecycle is an explicit
// state machine where illegal and post-terminal transitions are refused.
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  assertTransition,
  readStateFile,
  statePath,
  writeStateFile
} from "../src/runtime/state.js";
import { OmlError } from "../src/errors.js";

// --- state machine ----------------------------------------------------------

test("permits a declared transition", () => {
  assert.doesNotThrow(() => assertTransition("created", "policy_admitted"));
});

test("refuses an undeclared transition", () => {
  assert.throws(
    () => assertTransition("created", "executing"),
    (error: unknown) => error instanceof OmlError && error.code === "OML_STATE_TRANSITION_INVALID"
  );
});

test("refuses any transition out of a terminal state", () => {
  assert.throws(
    () => assertTransition("finalized", "executing"),
    (error: unknown) => error instanceof OmlError && error.code === "OML_STATE_ALREADY_TERMINAL"
  );
});

test("permits abort from any non-terminal state", () => {
  assert.doesNotThrow(() => assertTransition("executing", "aborted"));
});
// --- durability & recovery --------------------------------------------------

test("writes and reads a state file round-trip", async () => {
  const root = await mkdtemp(join(tmpdir(), "oml-state-"));
  const path = statePath(root, "run-1", "state.json");
  await writeStateFile(path, { state: "created", attempt: 1 });
  const body = await readStateFile(path);
  assert.deepEqual(body, { state: "created", attempt: 1 });
});

test("a truncated (non-JSON) state file is a hard partial-write error", async () => {
  const root = await mkdtemp(join(tmpdir(), "oml-state-"));
  const path = statePath(root, "run-1", "state.json");
  await writeStateFile(path, { state: "created" });
  await writeFile(path, "{ not valid json", "utf8");
  await assert.rejects(
    readStateFile(path),
    (error: unknown) => error instanceof OmlError && error.code === "OML_STATE_PARTIAL_WRITE"
  );
});

test("a content-hash mismatch (mutated body) is detected", async () => {
  const root = await mkdtemp(join(tmpdir(), "oml-state-"));
  const path = statePath(root, "run-1", "state.json");
  await writeStateFile(path, { state: "created" });
  const raw = JSON.parse(await readFile(path, "utf8")) as { schema_version: string; content_sha256: string; body: unknown };
  raw.body = { state: "finalized" }; // tamper with the body, keep the old hash
  await writeFile(path, JSON.stringify(raw), "utf8");
  await assert.rejects(
    readStateFile(path),
    (error: unknown) => error instanceof OmlError && error.code === "OML_STATE_PARTIAL_WRITE"
  );
});

test("an unknown schema version is refused rather than best-effort parsed", async () => {
  const root = await mkdtemp(join(tmpdir(), "oml-state-"));
  const path = statePath(root, "run-1", "state.json");
  await writeStateFile(path, { state: "created" });
  const raw = JSON.parse(await readFile(path, "utf8")) as { schema_version: string };
  raw.schema_version = "999.0";
  await writeFile(path, JSON.stringify(raw), "utf8");
  await assert.rejects(
    readStateFile(path),
    (error: unknown) => error instanceof OmlError && error.code === "OML_STATE_SCHEMA_UNKNOWN"
  );
});
