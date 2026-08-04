import assert from "node:assert/strict";
import test from "node:test";
import { canonicalJson, sha256 } from "../src/canonical.js";

test("canonical JSON orders object keys recursively", () => {
  assert.equal(canonicalJson({ z: 1, a: { d: true, b: false } }), '{"a":{"b":false,"d":true},"z":1}');
});

test("sha256 is deterministic", () => {
  assert.equal(sha256("luna"), "970ec274ca867815174ebe4eff19282000f9495a6c7254e94991d1fb4dc3df30");
});
