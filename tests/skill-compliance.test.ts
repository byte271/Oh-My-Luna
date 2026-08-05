import assert from "node:assert/strict";
import test from "node:test";
import { evaluateCompliance, splitSections } from "../src/probes/skill-compliance.js";

test("an absent artifact is its own verdict, not a zero score", () => {
  // This is the state skill v1 left every result in: the obligations may have
  // been performed perfectly or not at all, and nothing distinguishes those.
  const r = evaluateCompliance(null);
  assert.equal(r.verdict, "artifact_absent");
  assert.equal(r.artifact_present, false);
  assert.match(r.detail, /cannot be determined/);
});

test("all three obligations substantiated", () => {
  const r = evaluateCompliance(`# Verification

## Worst case
Pattern \`a*a*a*a*b\` against \`"a".repeat(n)\`, which does not match.
n=2000: 4.1 ms — n=4000: 8.4 ms. Ratio 2.05, linear.

## Falsification
Introduced \`const x: number = "s"\` into src/index.ts and ran the type-check:

\`\`\`
src/index.ts(88,7): error TS2322: Type 'string' is not assignable to type 'number'.
exit 2
\`\`\`

Restored.

## Limitations
Compiling patterns eagerly costs memory proportional to pattern length; a lazy
matcher would use less. Unicode case folding is not verified.
`);
  assert.equal(r.verdict, "complied");
  assert.equal(r.obligations_substantiated, 3);
});

test("a worst-case section with only one timing is thin, not compliant", () => {
  const r = evaluateCompliance("## Worst case\nIt runs in 4 ms and is linear.\n\n## Falsification\nx\n\n## Limitations\ny\n");
  const wc = r.obligations.find((o) => o.obligation === "worst_case");
  assert.equal(wc?.present, true);
  assert.equal(wc?.substantiated, false);
  assert.match(wc?.detail ?? "", /fewer than two timings/);
  assert.equal(r.verdict, "partial");
});

test("claiming a check can fail is not the check failing", () => {
  // The distinction the whole probe exists for.
  const claimed = evaluateCompliance("## Falsification\nThe type-check would fail on a type error.\n");
  const shown = evaluateCompliance(
    "## Falsification\nBroke it and ran:\n\n```\nerror TS2322: not assignable\nexit 2\n```\n"
  );
  assert.equal(claimed.obligations.find((o) => o.obligation === "falsification")?.substantiated, false);
  assert.equal(shown.obligations.find((o) => o.obligation === "falsification")?.substantiated, true);
});

test("a limitations section that names no cost is thin", () => {
  const empty = evaluateCompliance("## Limitations\nThe library is complete and works well.\n");
  const real = evaluateCompliance("## Limitations\nEager compilation costs memory; Unicode folding is not verified.\n");
  assert.equal(empty.obligations.find((o) => o.obligation === "limitations")?.substantiated, false);
  assert.equal(real.obligations.find((o) => o.obligation === "limitations")?.substantiated, true);
});

test("headings are matched case-insensitively and at any level", () => {
  const s = splitSections("# A\nbody a\n### worst CASE\nbody b\n");
  assert.equal(s.get("worst case"), "body b");
  assert.equal(s.get("a"), "body a");
});

test("compliance is explicitly not quality", () => {
  // Two fabricated timings satisfy this probe. growth.ts is what catches that,
  // and the detail string says so rather than letting the verdict be over-read.
  const r = evaluateCompliance(
    "## Worst case\nn=1000: 1 ms, n=2000: 2 ms.\n\n## Falsification\n```\nerror: exit 1\n```\n\n## Limitations\nCosts memory.\n"
  );
  assert.equal(r.verdict, "complied");
  assert.match(r.detail, /not quality/);
});

test("an empty file is not compliance", () => {
  const r = evaluateCompliance("");
  assert.equal(r.artifact_present, true);
  assert.equal(r.obligations_present, 0);
  assert.equal(r.verdict, "not_complied");
});
