import assert from "node:assert/strict";
import test from "node:test";
import { rankRepositoryDocuments } from "../src/repository-ranker.js";

const documents = [
  { path: "src/cache.ts", content: "export function readCacheKey() { return 'x'; }", recent_history_touches: 4 },
  { path: "src/render.ts", content: "export function renderPage() { return ''; }" },
  { path: "tests/cache.test.ts", content: "test('cache invalidation', () => {});" }
];

test("combines lexical, symbol, stack, test, and history signals deterministically", () => {
  const first = rankRepositoryDocuments("readCacheKey fails cache invalidation", documents, {
    stack_trace: "at readCacheKey (src/cache.ts:10:2)"
  });
  const second = rankRepositoryDocuments("readCacheKey fails cache invalidation", documents, {
    stack_trace: "at readCacheKey (src/cache.ts:10:2)"
  });
  assert.deepEqual(first, second);
  assert.equal(first[0]?.path, "src/cache.ts");
  assert.ok(first[0]?.signals.includes("stack_trace_path"));
  assert.ok(first[0]?.signals.some((signal) => signal.startsWith("recent_history:")));
});

test("breaks score ties by path", () => {
  const ranked = rankRepositoryDocuments("unmatched", [
    { path: "z.ts", content: "" },
    { path: "a.ts", content: "" }
  ]);
  assert.deepEqual(ranked.map((item) => item.path), ["a.ts", "z.ts"]);
});
