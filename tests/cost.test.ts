import assert from "node:assert/strict";
import test from "node:test";
import { calculateCostUsd } from "../src/cost.js";

test("cost separates cached from uncached input", () => {
  const cost = calculateCostUsd(
    { input_tokens: 1_000_000, cached_input_tokens: 250_000, output_tokens: 100_000 },
    { input: 2, cached_input: 1, output: 3 }
  );
  assert.equal(cost, 2.05);
});
