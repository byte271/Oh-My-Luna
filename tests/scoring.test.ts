import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { OmlError } from "../src/errors.js";
import { scoreWorkspace, validateScorerDeclaredInterface } from "../src/scoring.js";
import type { TaskFixture } from "../src/types.js";

const tempRoot = resolve(".test-temp");
const canary = "controller-only-gm-canary-271";

test("scorer declared interface rejects treatment canaries in argv, environment, stdin, and filenames", () => {
  for (const mutation of [
    { argv: ["node", canary], cwd: "/score", environment: {}, stdin: "", filenames: [] },
    { argv: ["node"], cwd: "/score", environment: { OML_TREATMENT: canary }, stdin: "", filenames: [] },
    { argv: ["node"], cwd: "/score", environment: {}, stdin: canary, filenames: [] },
    { argv: ["node"], cwd: "/score", environment: {}, stdin: "", filenames: [`result-${canary}.json`] }
  ]) {
    assert.throws(() => validateScorerDeclaredInterface(mutation, [canary]), matches("OML_SCORER_BLINDNESS_VIOLATION"));
  }
});

test("scorer uses a detached workspace and does not expose the adjacent orchestrator trace by its interface", async () => {
  await mkdir(tempRoot, { recursive: true });
  const root = await mkdtemp(resolve(tempRoot, "score-detached-"));
  const workspace = resolve(root, "workspace");
  await mkdir(workspace);
  await writeFile(resolve(root, "trace.jsonl"), canary, "utf8");
  const fixture = fixtureWithVerifier(["node", "-e", "const fs=require('fs'); process.exit(fs.existsSync('../trace.jsonl') ? 91 : 0)"]);
  const result = await scoreWorkspace(fixture, root, workspace, undefined, { forbiddenCanaries: [canary] });
  assert.equal(result.success, true);
  assert.equal(result.boundary.detachedWorkspace, true);
  assert.equal(result.boundary.classification, "interface_blind_host_confidentiality_not_enforced");
});

test("scorer rejects a canary embedded in a copied workspace filename", async () => {
  await mkdir(tempRoot, { recursive: true });
  const root = await mkdtemp(resolve(tempRoot, "score-name-"));
  const workspace = resolve(root, "workspace");
  await mkdir(workspace);
  await writeFile(resolve(workspace, `${canary}.txt`), "x", "utf8");
  await assert.rejects(scoreWorkspace(fixtureWithVerifier(["node", "-e", "process.exit(0)"]), root, workspace, undefined, { forbiddenCanaries: [canary] }), matches("OML_SCORER_BLINDNESS_VIOLATION"));
});

function fixtureWithVerifier(command: string[]): TaskFixture {
  return {
    schema_version: "0.2", id: "scorer-test", issue: "mechanics only",
    repository: { path: ".", commit: "fixture" },
    adapter: { id: "none", command: ["node"], model: "none", model_snapshot: "none", reasoning_effort: "none", service_tier: "not_applicable", prompt_sha256: "0".repeat(64), skill_sha256: null, rates_usd_per_million_tokens: { input: 0, cached_input: 0, output: 0 } },
    environment: { id: "test", definition_sha256: "0".repeat(64), image_digest: null },
    confidentiality: { hidden_paths: [] }, verifier: { command, success_exit_codes: [0] },
    limits: { adapter_timeout_ms: 1000, verifier_timeout_ms: 1000, max_output_bytes: 4096 }
  };
}

function matches(code: OmlError["code"]) {
  return (error: unknown) => error instanceof OmlError && error.code === code;
}
