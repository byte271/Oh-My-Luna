import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { validateMethodValidationFixtures } from "../src/schema.js";

test("Gate M catalog contains six mechanics-only executable fixture references", async () => {
  const value = JSON.parse(await readFile(resolve("fixtures/method/fixtures.json"), "utf8")) as unknown;
  const validated = await validateMethodValidationFixtures(value) as { capability_claim_permitted: boolean; fixtures: Array<{ id: string }> };
  assert.equal(validated.capability_claim_permitted, false);
  assert.equal(validated.fixtures.length, 6);
  assert.equal(new Set(validated.fixtures.map((fixture) => fixture.id)).size, 6);
});
