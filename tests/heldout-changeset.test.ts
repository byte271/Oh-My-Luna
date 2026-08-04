import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { assertContainedTarget, ContainmentError, validateChangeSet } from "../src/heldout/changeset.js";

const base = {
  status: "completed" as const,
  incompleteReason: null,
  maxBytes: 2_000_000,
  permittedPaths: ["src/index.ts", "src/types.ts"]
};

const changeSet = (files: unknown) => JSON.stringify({ files });

test("prose is a failure, not partial credit", () => {
  const verdict = validateChangeSet("I fixed it. All tests should pass now.", base);
  assert.equal(verdict.ok, false);
  assert.equal(verdict.ok === false && verdict.reason, "not_json");
});

test("an empty permitted set fails closed rather than permitting everything", () => {
  // v1 guarded the membership test with `permitted.size > 0`, so a task whose
  // permitted_paths was empty or malformed accepted writes to any path that did
  // not textually escape — including an evaluator.
  const verdict = validateChangeSet(changeSet([{ path: "anything.py", contents: "x" }]), {
    ...base,
    permittedPaths: []
  });
  assert.equal(verdict.ok, false);
  assert.equal(verdict.ok === false && verdict.reason, "no_permitted_paths_declared");
});

test("duplicate paths are rejected instead of resolved by write order", () => {
  const verdict = validateChangeSet(
    changeSet([
      { path: "src/index.ts", contents: "first" },
      { path: "src/index.ts", contents: "second" }
    ]),
    base
  );
  assert.equal(verdict.ok, false);
  assert.equal(verdict.ok === false && verdict.reason, "duplicate_path");
});

test("path escapes are rejected in every syntax, including foreign-platform absolutes", () => {
  for (const path of [
    "../evaluator.py",
    "../../etc/passwd",
    "/etc/passwd",
    "src/../../out.ts",
    "C:\\evaluator.py",
    "c:/evaluator.py",
    "\\\\host\\share\\x",
    "//host/share/x"
  ]) {
    const verdict = validateChangeSet(changeSet([{ path, contents: "x" }]), base);
    assert.equal(verdict.ok, false, `accepted ${path}`);
    assert.equal(
      verdict.ok === false && verdict.reason,
      "path_escapes_workspace",
      `wrong rejection for ${path}: ${verdict.ok === false ? verdict.reason : "ok"}`
    );
  }
});

test("paths with control characters are rejected", () => {
  const verdict = validateChangeSet(changeSet([{ path: "src/index.ts\u0000.py", contents: "x" }]), base);
  assert.equal(verdict.ok, false);
  assert.equal(verdict.ok === false && verdict.reason, "invalid_file_entry");
});

test("an unpermitted but non-escaping path is rejected", () => {
  const verdict = validateChangeSet(changeSet([{ path: "src/other.ts", contents: "x" }]), base);
  assert.equal(verdict.ok === false && verdict.reason, "path_not_permitted");
});

test("incomplete responses are distinguished from prose", () => {
  const verdict = validateChangeSet("", { ...base, status: "incomplete", incompleteReason: "max_output_tokens" });
  assert.equal(verdict.ok === false && verdict.reason, "response_incomplete");
  assert.match(verdict.ok === false ? verdict.detail : "", /max_output_tokens/);
});

test("an empty change set is a failure", () => {
  assert.equal(validateChangeSet(changeSet([]), base).ok, false);
});

test("a well-formed permitted change set is accepted and normalized", () => {
  const verdict = validateChangeSet(changeSet([{ path: "./src/index.ts", contents: "ok" }]), base);
  assert.equal(verdict.ok, true);
  assert.deepEqual(verdict.ok === true ? verdict.files : null, [{ path: "src/index.ts", contents: "ok" }]);
});

test("a write through a symlinked directory is refused before it reaches shared state", async (t) => {
  // Stage A links the shared base worktree's node_modules into each attempt's
  // workspace to skip a per-attempt install. A write through that link escapes
  // the disposable workspace and lands in state every later attempt reads.
  const root = await mkdtemp(resolve(tmpdir(), "oml-contain-"));
  t.after(() => rm(root, { recursive: true, force: true }));

  const shared = resolve(root, "shared");
  const workspace = resolve(root, "workspace");
  await mkdir(shared, { recursive: true });
  await mkdir(workspace, { recursive: true });
  await writeFile(resolve(shared, "marker.txt"), "shared state");

  try {
    await symlink(shared, resolve(workspace, "node_modules"), "dir");
  } catch {
    t.skip("host does not permit symlink creation");
    return;
  }

  await assert.rejects(
    () => assertContainedTarget(workspace, "node_modules/marker.txt"),
    (error: unknown) => error instanceof ContainmentError
  );

  // An ordinary path inside the workspace still resolves.
  const okTarget = await assertContainedTarget(workspace, "src/index.ts");
  assert.ok(okTarget.startsWith(resolve(root)));
});

test("containment permits a path whose parent directories do not exist yet", async (t) => {
  const root = await mkdtemp(resolve(tmpdir(), "oml-contain-new-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const target = await assertContainedTarget(root, "a/b/c/new-file.ts");
  assert.equal(target, resolve(root, "a/b/c/new-file.ts"));
});
