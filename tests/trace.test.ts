import assert from "node:assert/strict";
import { appendFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { TraceWriter, verifyTrace } from "../src/trace.js";
import { OmlError } from "../src/errors.js";

test("trace verifier accepts an intact chain and rejects appended tampering", async () => {
  const directory = await mkdtemp(join(tmpdir(), "oml-trace-"));
  const path = join(directory, "trace.jsonl");
  const writer = new TraceWriter(path, "run-1");
  await writer.append("one", { value: 1 });
  await writer.append("two", { value: 2 });
  assert.equal(await verifyTrace(path), writer.lastHash);
  await appendFile(path, '{"forged":true}\n', "utf8");
  await assert.rejects(verifyTrace(path), (error: unknown) => error instanceof OmlError);
});
