// Adversarial tests for the policy + execution broker (ADR 0017).
// Classes exercised here: path/filesystem, process, resource. Each test MEASURES
// broker behavior against a real write or a real spawn — it never merely asserts
// that a limit field exists.
import assert from "node:assert/strict";
import { mkdtemp, mkdir, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { Broker } from "../src/runtime/broker.js";
import { OmlError } from "../src/errors.js";
import type { ExecutionPolicy, ResourceBudget } from "../src/runtime/types.js";
import { SKIP_IF_NO_SYMLINK } from "./symlink-probe.js";

const NODE = process.execPath;

function makeLimits(patch: Partial<ResourceBudget> = {}): ResourceBudget {
  return {
    wall_clock_ms: 10_000,
    max_output_bytes: 1_000_000,
    max_command_count: 100,
    max_retries: 3,
    max_generated_files: 100,
    max_write_bytes: 1_000_000,
    unattested: ["cpu", "memory", "disk", "network", "syscalls", "process_tree"],
    ...patch
  };
}

function makePolicy(root: string, patch: Partial<ExecutionPolicy> = {}): ExecutionPolicy {
  return {
    workspace_root: root,
    read_paths: [],
    write_paths: [],
    symlink_policy: "reject",
    permitted_executables: [{ id: NODE, resolved_path_sha256: null, argv_policy: { mode: "any" } }],
    environment_allowlist: [],
    limits: makeLimits(),
    ...patch
  };
}

async function ws(): Promise<string> {
  return await mkdtemp(join(tmpdir(), "oml-broker-"));
}
// --- policy validity (principle 8: unattested must be disclosed) -----------

test("rejects a non-absolute workspace root", async () => {
  assert.throws(
    () => new Broker(makePolicy("relative/root")),
    (error: unknown) => error instanceof OmlError && error.code === "OML_POLICY_INVALID"
  );
});

test("rejects a policy that hides an unattested resource", async () => {
  const root = await ws();
  const policy = makePolicy(root, { limits: makeLimits({ unattested: ["cpu", "memory"] }) });
  assert.throws(
    () => new Broker(policy),
    (error: unknown) => error instanceof OmlError && error.code === "OML_POLICY_INVALID"
  );
});

// --- path / filesystem class ------------------------------------------------

test("rejects an absolute write path", async () => {
  const root = await ws();
  const broker = new Broker(makePolicy(root));
  await assert.rejects(
    broker.applyWrite({ kind: "write", path: join(root, "abs.txt"), content: "x" }),
    (error: unknown) => error instanceof OmlError && error.code === "OML_PATH_ESCAPE"
  );
});

test("rejects a parent-traversal write path", async () => {
  const root = await ws();
  const broker = new Broker(makePolicy(root));
  await assert.rejects(
    broker.applyWrite({ kind: "write", path: "../escape.txt", content: "x" }),
    (error: unknown) => error instanceof OmlError && error.code === "OML_PATH_ESCAPE"
  );
});

test("rejects a write outside declared write_paths", async () => {
  const root = await ws();
  const broker = new Broker(makePolicy(root, { write_paths: ["allowed"] }));
  await assert.rejects(
    broker.applyWrite({ kind: "write", path: "elsewhere/file.txt", content: "x" }),
    (error: unknown) => error instanceof OmlError && error.code === "OML_PATH_NOT_WRITABLE"
  );
});
test("permits a write inside declared write_paths and commits byte budget", async () => {
  const root = await ws();
  const broker = new Broker(makePolicy(root, { write_paths: ["allowed"] }));
  const changed = await broker.applyWrite({ kind: "write", path: "allowed/file.txt", content: "hello" });
  assert.deepEqual(changed, ["allowed/file.txt"]);
  assert.equal(broker.ledger.write_bytes_used, 5);
  assert.equal(broker.ledger.files_generated, 1);
});

test("rejects a write through a symlinked parent (reuses environment.ts enforcement)", { skip: SKIP_IF_NO_SYMLINK }, async () => {
  const root = await ws();
  const outside = await mkdtemp(join(tmpdir(), "oml-outside-"));
  await mkdir(join(outside, "dir"));
  await symlink(join(outside, "dir"), join(root, "linked"), "dir");
  const broker = new Broker(makePolicy(root));
  await assert.rejects(
    broker.applyWrite({ kind: "write", path: "linked/escape.txt", content: "x" }),
    (error: unknown) => error instanceof OmlError && error.code === "OML_SYMLINK_REJECTED"
  );
});

// --- process class ----------------------------------------------------------

test("rejects an executable not on the allowlist", async () => {
  const root = await ws();
  const broker = new Broker(makePolicy(root));
  await assert.rejects(
    broker.exec({ kind: "exec", argv: ["definitely-not-permitted", "-v"], cwd: "." }),
    (error: unknown) => error instanceof OmlError && error.code === "OML_EXECUTABLE_NOT_PERMITTED"
  );
});

test("rejects arguments that violate an exact argv policy", async () => {
  const root = await ws();
  const policy = makePolicy(root, {
    permitted_executables: [
      { id: NODE, resolved_path_sha256: null, argv_policy: { mode: "exact", allowed_argv: [NODE, "-v"] } }
    ]
  });
  const broker = new Broker(policy);
  await assert.rejects(
    broker.exec({ kind: "exec", argv: [NODE, "-e", "0"], cwd: "." }),
    (error: unknown) => error instanceof OmlError && error.code === "OML_ARG_REJECTED"
  );
});

test("rejects an environment name outside the policy allowlist", async () => {
  const root = await ws();
  const broker = new Broker(makePolicy(root, { environment_allowlist: ["FOO"] }));
  await assert.rejects(
    broker.exec({ kind: "exec", argv: [NODE, "-v"], cwd: ".", environmentAllowlist: ["BAR"] }),
    (error: unknown) => error instanceof OmlError && error.code === "OML_ENV_NOT_ALLOWLISTED"
  );
});

test("rejects a cwd that escapes the workspace root", async () => {
  const root = await ws();
  const broker = new Broker(makePolicy(root));
  await assert.rejects(
    broker.exec({ kind: "exec", argv: [NODE, "-v"], cwd: "../../.." }),
    (error: unknown) => error instanceof OmlError && error.code === "OML_PATH_ESCAPE"
  );
});
// --- resource class (measured, not asserted-by-existence) -------------------

test("enforces the wall-clock timeout by killing a slow process", async () => {
  const root = await ws();
  const broker = new Broker(makePolicy(root, { limits: makeLimits({ wall_clock_ms: 200 }) }));
  await assert.rejects(
    broker.exec({ kind: "exec", argv: [NODE, "-e", "setTimeout(() => {}, 60000)"], cwd: "." }),
    (error: unknown) => error instanceof OmlError && error.code === "OML_PROCESS_TIMEOUT"
  );
});

test("enforces the output cap by killing an over-producing process", async () => {
  const root = await ws();
  const broker = new Broker(makePolicy(root, { limits: makeLimits({ max_output_bytes: 64 }) }));
  await assert.rejects(
    broker.exec({
      kind: "exec",
      argv: [NODE, "-e", "process.stdout.write('x'.repeat(100000))"],
      cwd: "."
    }),
    (error: unknown) => error instanceof OmlError && error.code === "OML_PROCESS_OUTPUT_LIMIT"
  );
});

test("enforces the command-count budget across successive execs", async () => {
  const root = await ws();
  const broker = new Broker(makePolicy(root, { limits: makeLimits({ max_command_count: 1 }) }));
  const first = await broker.exec({ kind: "exec", argv: [NODE, "-e", "0"], cwd: "." });
  assert.equal(first.exitCode, 0);
  assert.equal(broker.ledger.commands_used, 1);
  await assert.rejects(
    broker.exec({ kind: "exec", argv: [NODE, "-e", "0"], cwd: "." }),
    (error: unknown) => error instanceof OmlError && error.code === "OML_COMMAND_BUDGET_EXCEEDED"
  );
});

test("enforces the retry budget", async () => {
  const root = await ws();
  const broker = new Broker(makePolicy(root, { limits: makeLimits({ max_retries: 1 }) }));
  broker.chargeRetry();
  assert.equal(broker.ledger.retries_used, 1);
  assert.throws(
    () => broker.chargeRetry(),
    (error: unknown) => error instanceof OmlError && error.code === "OML_RETRY_BUDGET_EXCEEDED"
  );
});

test("enforces the generated-file budget", async () => {
  const root = await ws();
  const broker = new Broker(makePolicy(root, { limits: makeLimits({ max_generated_files: 1 }) }));
  await broker.applyWrite({ kind: "write", path: "a.txt", content: "1" });
  await assert.rejects(
    broker.applyWrite({ kind: "write", path: "b.txt", content: "1" }),
    (error: unknown) => error instanceof OmlError && error.code === "OML_FILE_COUNT_BUDGET_EXCEEDED"
  );
});

test("enforces the write-bytes budget", async () => {
  const root = await ws();
  const broker = new Broker(makePolicy(root, { limits: makeLimits({ max_write_bytes: 4 }) }));
  await assert.rejects(
    broker.applyWrite({ kind: "write", path: "big.txt", content: "toolong" }),
    (error: unknown) => error instanceof OmlError && error.code === "OML_WRITE_BYTES_BUDGET_EXCEEDED"
  );
});

test("a permitted process runs end to end and its output is returned", async () => {
  const root = await ws();
  const broker = new Broker(makePolicy(root));
  const result = await broker.exec({ kind: "exec", argv: [NODE, "-e", "process.stdout.write('ok')"], cwd: "." });
  assert.equal(result.exitCode, 0);
  assert.equal(result.stdout.toString("utf8"), "ok");
});
