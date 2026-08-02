import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import test from "node:test";
import { runEvaluation } from "../src/runner.js";

test("runner executes the deterministic smoke fixture end to end", async () => {
  const runsRoot = await mkdtemp(join(tmpdir(), "oml-runner-"));
  const result = await runEvaluation({
    fixturePath: resolve("fixtures/smoke/task.json"),
    runsRoot
  });
  assert.equal(result.receipt.status, "verified");
  assert.equal(result.receipt.model, "test-double/not-a-model");
  assert.equal(result.receipt.cost_usd, 0);
  assert.equal(result.receipt.error_codes.length, 0);
  const receiptOnDisk = JSON.parse(await readFile(result.receiptPath, "utf8")) as { run_id: string };
  assert.equal(receiptOnDisk.run_id, result.receipt.run_id);
});

test("runner withholds verified status when the named verifier fails", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "oml-failed-run-"));
  const originalPath = resolve("fixtures/smoke/task.json");
  const fixture = JSON.parse(await readFile(originalPath, "utf8")) as {
    repository: { path: string };
    adapter: { command: string[] };
    verifier: { command: string[] };
  };
  fixture.repository.path = resolve("fixtures/smoke/repository");
  fixture.adapter.command = ["node", resolve("fixtures/smoke/deterministic-adapter.mjs")];
  fixture.verifier.command = ["node", "-e", "process.exit(9)"];
  const fixturePath = join(temporary, "failed-task.json");
  await writeFile(fixturePath, JSON.stringify(fixture), "utf8");
  const result = await runEvaluation({ fixturePath, runsRoot: join(temporary, "runs") });
  assert.equal(result.receipt.status, "failed");
  assert.deepEqual(result.receipt.error_codes, ["OML_VERIFIER_FAILED"]);
  assert.equal(result.receipt.score.success, false);
  assert.equal(result.receipt.score.exit_code, 9);
});

test("runner refuses a fixture that asks copy isolation to run sandbox-required work", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "oml-sandbox-refusal-"));
  const fixture = JSON.parse(await readFile(resolve("fixtures/smoke/task.json"), "utf8")) as {
    requires_security_sandbox: boolean;
  };
  fixture.requires_security_sandbox = true;
  const fixturePath = join(temporary, "sandbox-task.json");
  await writeFile(fixturePath, JSON.stringify(fixture), "utf8");
  await assert.rejects(runEvaluation({ fixturePath, runsRoot: join(temporary, "runs") }), /security sandbox/);
});
