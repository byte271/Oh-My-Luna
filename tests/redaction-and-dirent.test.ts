import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { readdir } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { redactSecrets } from "../src/providers/openai-responses.js";
import { hashWorkspaceTree } from "../src/runtime/evidence.js";
import { direntParent } from "../src/dirent.js";

/* ---------------------------------------------------------------- redaction */

const KEY = "sk-proj-AAAABBBBCCCCDDDDEEEEFFFF";

test("the live key is removed exactly, wherever it appears", () => {
  for (const text of [
    `Incorrect API key provided: ${KEY}`,
    `{"authorization":"Bearer ${KEY}"}`,
    `${KEY}`,
    `a${KEY}b`,
    `${KEY} ${KEY}`
  ]) {
    const out = redactSecrets(text, KEY);
    assert.ok(!out.includes(KEY), `leaked: ${text}`);
  }
});

test("the backstop catches a key this process was never handed", () => {
  // A credential belonging to another account, pasted into an upstream error.
  const foreign = "sk-proj-ZZZZYYYYXXXXWWWWVVVV";
  const out = redactSecrets(`upstream said: ${foreign}`);
  assert.ok(!out.includes(foreign));
});

test("the backstop no longer requires a word boundary", () => {
  // `\b` does not match between two word characters, so a key concatenated to a
  // preceding token used to survive redaction when no apiKey was supplied.
  const out = redactSecrets("prefixsk-AAAABBBBCCCCDDDD");
  assert.ok(!out.includes("sk-AAAABBBBCCCCDDDD"), `leaked: ${out}`);
});

test("session tokens are redacted", () => {
  const out = redactSecrets("token sess-abcdefghijklmnopqrs");
  assert.ok(!out.includes("sess-abcdefghijklmnopqrs"));
});

test("organization identifiers are deliberately preserved", () => {
  // Not a credential. Blanking it destroys the account context that makes a
  // billing dispute diagnosable.
  const out = redactSecrets("org-abcdefghijklmnop exceeded quota");
  assert.match(out, /org-abcdefghijklmnop/);
});

test("redaction is total, not partial — no key fragment survives", () => {
  const out = redactSecrets(`key=${KEY}`, KEY);
  // Any run of >=8 key-ish characters from the original must be gone.
  assert.ok(!out.includes(KEY.slice(8, 24)));
});

/* ------------------------------------------------------------------ dirent */

test("Dirent exposes a usable parent under either spelling", async () => {
  // `parentPath` is Node 20.12+; `path` is the pre-20.12 spelling of the same
  // field. package.json declares engines.node ">=20", so both must be handled:
  // a bare `?? root` fallback collapses every nested entry to root/<basename>.
  const root = await mkdtemp(resolve(tmpdir(), "oml-dirent-"));
  try {
    await mkdir(join(root, "a", "b"), { recursive: true });
    await writeFile(join(root, "a", "b", "deep.txt"), "x");
    const entries = await readdir(root, { recursive: true, withFileTypes: true });
    const deep = entries.find((e) => e.name === "deep.txt");
    assert.ok(deep, "nested entry not enumerated");

    const parent = direntParent(deep, root);
    const rel = relative(root, join(parent, deep.name)).replaceAll("\\", "/");
    assert.equal(rel, "a/b/deep.txt");

    // The old fallback, shown failing, so this test documents what it prevents.
    const collapsed = relative(root, join(root, deep.name));
    assert.equal(collapsed, "deep.txt");
    assert.notEqual(collapsed, rel);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("workspace tree hash distinguishes files that differ only by directory", async () => {
  // Under the collapsing fallback both trees hash the same relative path, so a
  // move between directories would be invisible to the evidence VM.
  const one = await mkdtemp(resolve(tmpdir(), "oml-tree-a-"));
  const two = await mkdtemp(resolve(tmpdir(), "oml-tree-b-"));
  try {
    await mkdir(join(one, "alpha"), { recursive: true });
    await writeFile(join(one, "alpha", "f.txt"), "same contents");
    await mkdir(join(two, "beta"), { recursive: true });
    await writeFile(join(two, "beta", "f.txt"), "same contents");

    assert.notEqual(await hashWorkspaceTree(one), await hashWorkspaceTree(two));
  } finally {
    await rm(one, { recursive: true, force: true });
    await rm(two, { recursive: true, force: true });
  }
});

test("workspace tree hash reads nested files rather than throwing", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "oml-tree-deep-"));
  try {
    await mkdir(join(root, "x", "y", "z"), { recursive: true });
    await writeFile(join(root, "x", "y", "z", "leaf.txt"), "leaf");
    const before = await hashWorkspaceTree(root);
    await writeFile(join(root, "x", "y", "z", "leaf.txt"), "leaf changed");
    assert.notEqual(before, await hashWorkspaceTree(root));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
