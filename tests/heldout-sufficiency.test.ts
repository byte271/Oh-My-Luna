import assert from "node:assert/strict";
import test from "node:test";
import { buildTaskPrompt, renderAssistance } from "../src/heldout/prompt.js";
import {
  aggregate,
  auditTemplateClaims,
  checkOutputCapHeadroom,
  checkPromptCompleteness,
  checkStubRealism,
  evaluateSourcePresence,
  exitCodeFor,
  probeLines,
  requiredOutputTokens,
  SUFFICIENCY_EXIT
} from "../src/heldout/sufficiency.js";
import { noopStub, proseStub, unseenStub, STUB_DECLARATIONS } from "../src/heldout/stubs.js";
import { estimateChangeSetTokens, estimateTokens, estimateTokensConservative } from "../src/heldout/tokens.js";

const V1_TEMPLATE = `<issue>
{{ISSUE}}
</issue>
{{ASSISTANCE}}
Repository root contains the project source. Apply your fix and reply with the
JSON object described in the system prompt.`;

const V2_TEMPLATE = `<issue>
{{ISSUE}}
</issue>
<source>
{{SOURCE}}
</source>
{{ASSISTANCE}}
Apply your fix and reply with the JSON object described in the system prompt.`;

const SOURCE = Array.from({ length: 40 }, (_, i) => `export const identifier_${i} = computeSomething(${i});`).join("\n");
const sources = [{ path: "src/index.ts", contents: SOURCE }];

test("the v1 prompt shape is detected as omitting its source", () => {
  const prompt = buildTaskPrompt(V1_TEMPLATE, { issue: "it is broken", sources, assistance: "" });
  const presence = evaluateSourcePresence(prompt, SOURCE);
  assert.equal(presence.present, false);
  assert.equal(presence.found, 0);
});

test("the v2 prompt shape carries its source", () => {
  const prompt = buildTaskPrompt(V2_TEMPLATE, { issue: "it is broken", sources, assistance: "" });
  const presence = evaluateSourcePresence(prompt, SOURCE);
  assert.equal(presence.present, true);
  assert.equal(presence.found, presence.probes);
});

test("one quoted line does not satisfy the presence check", () => {
  // The single-probe version of this check could be satisfied by a T1-T3
  // assistance packet quoting a base-state symbol, reporting a prompt as
  // carrying source it does not carry.
  const quotedLine = SOURCE.split("\n")[20];
  assert.ok(quotedLine !== undefined);
  const prompt = buildTaskPrompt(V1_TEMPLATE, {
    issue: "it is broken",
    sources: [],
    assistance: renderAssistance({ failing_boundary: quotedLine })
  });
  assert.ok(prompt.includes(quotedLine));
  assert.equal(evaluateSourcePresence(prompt, SOURCE).present, false);
});

test("probes are drawn from the interior and are distinct", () => {
  const probes = probeLines(SOURCE, 5);
  assert.equal(probes.length, 5);
  assert.equal(new Set(probes).size, 5);
  assert.ok(!probes.includes(SOURCE.split("\n")[0] ?? ""), "first line should not be a probe");
});

test("a file with no substantial line is absent rather than vacuously present", () => {
  assert.equal(evaluateSourcePresence("anything", "x\ny\n\n").present, false);
});

test("prompt completeness is blocking and reports the absent rows", () => {
  const finding = checkPromptCompleteness([
    { task_id: "t", arm: "T0", path: "a.ts", source_present_in_prompt: false, probe_count: 5, probes_found: 0 },
    { task_id: "t", arm: "T1", path: "a.ts", source_present_in_prompt: true, probe_count: 5, probes_found: 5 }
  ]);
  assert.equal(finding.ok, false);
  assert.equal(finding.severity, "blocking");
  assert.equal(exitCodeFor(aggregate([finding])), SUFFICIENCY_EXIT.PROMPT_INCOMPLETE);
});

test("zero checked rows is a failure, not a vacuous pass", () => {
  // A sufficiency check that passes because it examined nothing is exactly the
  // failure mode this class of gate exists to prevent.
  assert.equal(checkPromptCompleteness([]).ok, false);
  assert.equal(checkStubRealism([]).ok, false);
  assert.equal(checkOutputCapHeadroom([], 8192, 2048).ok, false);
});

test("output-cap headroom measures the JSON envelope, not the raw source", () => {
  // The model emits its file inside a JSON string, so escaping and the envelope
  // both count against max_output_tokens.
  const raw = estimateTokens(SOURCE);
  const encoded = requiredOutputTokens(sources);
  assert.ok(encoded > raw, `envelope ${encoded} should exceed raw ${raw}`);
  assert.equal(encoded, estimateChangeSetTokens(sources));
});

test("a multi-file task is measured as one response, not per file", () => {
  const two = [
    { path: "a.ts", contents: SOURCE },
    { path: "b.ts", contents: SOURCE }
  ];
  assert.ok(requiredOutputTokens(two) > requiredOutputTokens([two[0]!]));
});

test("output-cap headroom reports the minimum defensible cap", () => {
  const finding = checkOutputCapHeadroom(
    [
      { task_id: "small", required_output_tokens: 1_400, fits: true },
      { task_id: "boltons", required_output_tokens: 15_262, fits: false }
    ],
    8192,
    2048
  );
  assert.equal(finding.ok, false);
  assert.equal(finding.evidence?.["minimum_defensible_cap"], 15_262 + 2048);
  assert.equal(exitCodeFor(aggregate([finding])), SUFFICIENCY_EXIT.OUTPUT_CAP);
});

test("the v1 template is caught claiming filesystem access the transport withholds", () => {
  // "Repository root contains the project source." under tools: [] tells the
  // model it has access it does not have.
  const finding = auditTemplateClaims([V1_TEMPLATE], { tools: [], store: false, sourceInPrompt: false });
  assert.equal(finding.ok, false);
  const violations = finding.evidence?.["violations"] as Array<{ id: string }>;
  assert.ok(violations.some((v) => v.id === "repository_root_available"));
});

test("the v2 template asserts no withheld capability", () => {
  const finding = auditTemplateClaims([V2_TEMPLATE], { tools: [], store: false, sourceInPrompt: true });
  assert.equal(finding.ok, true);
  assert.equal(finding.evidence?.["is_heuristic"], true);
});

test("a tool claim is permitted only when tools are actually attached", () => {
  const text = "Use the provided tools to inspect the project.";
  assert.equal(auditTemplateClaims([text], { tools: [], store: false, sourceInPrompt: true }).ok, false);
  assert.equal(auditTemplateClaims([text], { tools: ["read_file"], store: false, sourceInPrompt: true }).ok, true);
});

test("an unprivileged stub that read from disk fails the realism check", () => {
  // The generalized lesson: v1's oracle and noop both ran `git show`, so they
  // held exactly what the model lacked. That is how 20/20 PASS coexisted with a
  // protocol no model could satisfy.
  const finding = checkStubRealism([
    { name: "noop", privileged: false, readFromDisk: true, purpose: "base file" },
    { name: "oracle", privileged: true, readFromDisk: true, purpose: "corrected file" }
  ]);
  assert.equal(finding.ok, false);
  assert.equal(exitCodeFor(aggregate([finding])), SUFFICIENCY_EXIT.STUB_REALISM);
});

test("a privileged stub reading from disk is permitted but declared", () => {
  const finding = checkStubRealism([
    { name: "noop", privileged: false, readFromDisk: false, purpose: "base file from prompt" },
    { name: "oracle", privileged: true, readFromDisk: true, purpose: "corrected file" }
  ]);
  assert.equal(finding.ok, true);
  assert.match(finding.detail, /oracle/);
});

test("every declared stub is either unprivileged or names why it is privileged", () => {
  for (const stub of STUB_DECLARATIONS) {
    assert.ok(stub.purpose.length > 20, `${stub.name} needs a stated purpose`);
    if (stub.privileged) assert.match(stub.purpose, /oracle|corrected|composition/i);
  }
  assert.deepEqual(
    STUB_DECLARATIONS.filter((s) => !s.privileged).map((s) => s.name).sort(),
    ["noop", "prose", "unseen"]
  );
});

test("the noop stub reproduces the base file only when the prompt carries it", () => {
  const v2Prompt = buildTaskPrompt(V2_TEMPLATE, { issue: "i", sources, assistance: "" });
  const fromV2 = JSON.parse(noopStub({ prompt: v2Prompt, permittedPaths: ["src/index.ts"] })) as {
    files?: Array<{ path: string; contents: string }>;
  };
  assert.equal(fromV2.files?.[0]?.contents, SOURCE);

  // Under the v1 prompt shape the same stub cannot produce the file, so the dry
  // run goes red instead of reporting 20/20 over a broken protocol.
  const v1Prompt = buildTaskPrompt(V1_TEMPLATE, { issue: "i", sources, assistance: "" });
  const fromV1 = JSON.parse(noopStub({ prompt: v1Prompt, permittedPaths: ["src/index.ts"] })) as {
    error?: string;
    files?: unknown;
  };
  assert.equal(fromV1.error, "prompt_did_not_contain_source");
  assert.equal(fromV1.files, undefined);
});

test("the unseen stub is well-formed JSON with the right paths and invented contents", () => {
  const parsed = JSON.parse(unseenStub({ prompt: "", permittedPaths: ["src/index.ts"] })) as {
    files: Array<{ path: string; contents: string }>;
  };
  assert.equal(parsed.files[0]?.path, "src/index.ts");
  assert.ok(!parsed.files[0]?.contents.includes("identifier_20"));
});

test("the prose stub is not JSON, so it can only ever be a failure", () => {
  assert.throws(() => JSON.parse(proseStub({ prompt: "", permittedPaths: [] })));
});

test("the conservative estimator never under-counts relative to the neutral one", () => {
  for (const text of [SOURCE, "简体中文的示例文本，用于检验估计值。", "", "a".repeat(1000)]) {
    assert.ok(estimateTokensConservative(text) >= estimateTokens(text), `under-counted: ${text.slice(0, 20)}`);
  }
});

test("aggregate reports the first blocking failure and zero cost", () => {
  const report = aggregate([
    { check: "prompt_completeness", ok: true, severity: "blocking", detail: "" },
    { check: "output_cap_headroom", ok: false, severity: "blocking", detail: "" },
    { check: "template_claim_audit", ok: false, severity: "blocking", detail: "" }
  ]);
  assert.equal(report.ok, false);
  assert.equal(report.blocking_failures, 2);
  assert.equal(report.cost_usd, 0);
  assert.equal(report.contacted_provider, false);
  assert.equal(exitCodeFor(report), SUFFICIENCY_EXIT.OUTPUT_CAP);
});
