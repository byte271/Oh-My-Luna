import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { applyProposedFiles } from "../src/environment.js";
import { OmlError } from "../src/errors.js";
import { SKIP_IF_NO_SYMLINK } from "./symlink-probe.js";

test("applies a scoped proposed file", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "oml-environment-"));
  await applyProposedFiles(workspace, [{ path: "src/value.txt", content: "ok\n" }]);
  assert.equal(await readFile(join(workspace, "src/value.txt"), "utf8"), "ok\n");
});

test("rejects parent traversal", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "oml-environment-"));
  await assert.rejects(
    applyProposedFiles(workspace, [{ path: "../escape.txt", content: "bad" }]),
    (error: unknown) => error instanceof OmlError && error.code === "OML_PATH_ESCAPE"
  );
});

test("rejects symlink traversal", { skip: SKIP_IF_NO_SYMLINK }, async () => {
  const workspace = await mkdtemp(join(tmpdir(), "oml-environment-"));
  const outside = await mkdtemp(join(tmpdir(), "oml-outside-"));
  await mkdir(join(outside, "dir"));
  await symlink(join(outside, "dir"), join(workspace, "linked"), "dir");
  await assert.rejects(
    applyProposedFiles(workspace, [{ path: "linked/escape.txt", content: "bad" }]),
    (error: unknown) => error instanceof OmlError && error.code === "OML_SYMLINK_REJECTED"
  );
});
