import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolve } from "node:path";
import test from "node:test";
import { OmlError } from "../src/errors.js";
import { loadAndVerifyPricingEvidence } from "../src/pricing-evidence.js";
import { validatePricingSnapshot } from "../src/schema.js";
import type { PricingEvidence } from "../src/types.js";

test("versioned OpenAI pricing snapshot is schema-valid and internally consistent", async () => {
  const raw = JSON.parse(await readFile(resolve("data/pricing/openai-2026-08-01.json"), "utf8")) as unknown;
  const snapshot = await validatePricingSnapshot(raw);
  const luna = snapshot.models["gpt-5.6-luna"];
  const sol = snapshot.models["gpt-5.6-sol"];
  assert.ok(luna);
  assert.ok(sol);
  assert.equal(sol.input / luna.input, snapshot.derived_ratios["sol_to_luna_input"]);
  assert.equal(sol.cached_input / luna.cached_input, snapshot.derived_ratios["sol_to_luna_cached_input"]);
  assert.equal(sol.output / luna.output, snapshot.derived_ratios["sol_to_luna_output"]);
});

test("captured pricing evidence is hash-bound and reparses to the recorded values", async () => {
  const evidence = await loadAndVerifyPricingEvidence("data/pricing/openai-2026-08-02.evidence.json");
  assert.equal(evidence.extracted["gpt-5.6-sol"]!.short_context.input, 5);
  assert.equal(evidence.extracted["gpt-5.6-luna"]!.short_context.input, 0.2);
  assert.equal(evidence.derived_ratios["sol_to_luna_short_input"], 25);
});

test("rejects a pricing record whose captured-source hash is changed", async () => {
  const evidence = JSON.parse(await readFile(resolve("data/pricing/openai-2026-08-02.evidence.json"), "utf8")) as PricingEvidence;
  evidence.sources[0]!.evidence_sha256 = "0".repeat(64);
  const directory = await mkdtemp(join(tmpdir(), "oml-pricing-"));
  const recordPath = join(directory, "evidence.json");
  await writeFile(recordPath, JSON.stringify(evidence), "utf8");
  await assert.rejects(
    loadAndVerifyPricingEvidence(recordPath),
    (error: unknown) => error instanceof OmlError && error.code === "OML_PRICING_EVIDENCE_HASH_MISMATCH"
  );
});
