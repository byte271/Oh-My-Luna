import assert from "node:assert/strict";
import test from "node:test";
import { validateTaskFixture } from "../src/schema.js";
import { OmlError } from "../src/errors.js";

test("fixture schema rejects unknown fields", async () => {
  await assert.rejects(
    validateTaskFixture({ schema_version: "0.1", unexpected: true }),
    (error: unknown) => error instanceof OmlError && error.code === "OML_FIXTURE_INVALID"
  );
});
