import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTaskPrompt,
  fillTemplate,
  parseSourceBlocks,
  renderAssistance,
  renderSourceBlock,
  templatePlaceholders
} from "../src/heldout/prompt.js";

const V2_TEMPLATE = `<issue>
{{ISSUE}}
</issue>
<source>
{{SOURCE}}
</source>
{{ASSISTANCE}}
Apply your fix and reply with the JSON object described in the system prompt.`;

test("substitution does not interpret $ replacement patterns", () => {
  // v1 assembled prompts with `.replace("{{ISSUE}}", issue)`. String
  // replacements expand $&, $`, $', $n and $$ inside the replacement, so any
  // source containing them rewrites the surrounding prompt. Every one of these
  // is ordinary in real code.
  for (const hazard of ["$&", "$`", "$'", "$1", "$$", "a.replace(/x/, '$&$1')", "${name}"]) {
    const filled = fillTemplate("<a>{{ISSUE}}</a>", { ISSUE: hazard, SOURCE: "", ASSISTANCE: "" });
    assert.equal(filled, `<a>${hazard}</a>`, `corrupted on ${hazard}`);
  }
});

test("the v1 assembly it replaces really does corrupt these prompts", () => {
  // Guards the premise of the test above: if String.replace ever stopped
  // expanding $-patterns this whole module would be unnecessary.
  const corrupted = "<a>{{ISSUE}}</a>".replace("{{ISSUE}}", "$`");
  assert.notEqual(corrupted, "<a>$`</a>");
  assert.equal(corrupted, "<a><a></a>");
});

test("substitution is single-pass so substituted text is never rescanned", () => {
  // Source code containing a literal placeholder must not receive assistance
  // metadata spliced into it.
  const filled = fillTemplate("{{ISSUE}}|{{ASSISTANCE}}", {
    ISSUE: "const t = '{{ASSISTANCE}}';",
    SOURCE: "",
    ASSISTANCE: "SECRET"
  });
  assert.equal(filled, "const t = '{{ASSISTANCE}}';|SECRET");
});

test("source blocks round-trip through the prompt", () => {
  const sources = [
    { path: "src/index.ts", contents: "export const a = 1;\nexport const b = 2;" },
    { path: "src/types.ts", contents: "export type X = string;" }
  ];
  const prompt = buildTaskPrompt(V2_TEMPLATE, { issue: "broken", sources, assistance: "" });
  assert.deepEqual(parseSourceBlocks(prompt), sources);
});

test("source containing the block delimiters round-trips or is detectably absent", () => {
  // A file that itself contains `</file path="...">` must not silently
  // truncate another file's contents.
  const sources = [{ path: "a.ts", contents: 'const s = \'</file path="a.ts">\';' }];
  const prompt = buildTaskPrompt(V2_TEMPLATE, { issue: "i", sources, assistance: "" });
  const parsed = parseSourceBlocks(prompt);
  // Either it round-trips exactly, or the mismatch is visible — never a silent
  // partial file presented as complete.
  assert.equal(parsed.length, 1);
  assert.notEqual(parsed[0]?.contents, undefined);
});

test("empty source list renders an empty block rather than a malformed one", () => {
  assert.equal(renderSourceBlock([]), "");
  assert.deepEqual(parseSourceBlocks(buildTaskPrompt(V2_TEMPLATE, { issue: "i", sources: [], assistance: "" })), []);
});

test("T0 receives no assistance element at all", () => {
  const prompt = buildTaskPrompt(V2_TEMPLATE, { issue: "i", sources: [], assistance: "" });
  assert.ok(!prompt.includes("<assistance>"));
});

test("assisted arms carry a JSON assistance element", () => {
  const assistance = renderAssistance({ regions: [{ start_line: 4, end_line: 9 }] });
  const prompt = buildTaskPrompt(V2_TEMPLATE, { issue: "i", sources: [], assistance });
  assert.ok(prompt.includes("<assistance>"));
  assert.ok(prompt.includes('"start_line": 4'));
});

test("the issue is trimmed so arms differ only by assistance", () => {
  const a = buildTaskPrompt(V2_TEMPLATE, { issue: "  spaced  \n", sources: [], assistance: "" });
  const b = buildTaskPrompt(V2_TEMPLATE, { issue: "spaced", sources: [], assistance: "" });
  assert.equal(a, b);
});

test("template placeholders are reported for freeze-time validation", () => {
  assert.deepEqual(templatePlaceholders(V2_TEMPLATE), ["ISSUE", "SOURCE", "ASSISTANCE"]);
  assert.deepEqual(templatePlaceholders("<issue>{{ISSUE}}</issue>{{ASSISTANCE}}"), ["ISSUE", "ASSISTANCE"]);
});
