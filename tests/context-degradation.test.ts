import assert from "node:assert/strict";
import test from "node:test";
import {
  SELF_CHECK_CASES,
  SELF_CHECK_GRID,
  SELF_CHECK_LIMIT_TOKENS,
  buildContext,
  buildNeedle,
  probeContextDegradation,
  runSelfCheck,
  syntheticResponder
} from "../src/probes/context-degradation.js";

/* ------------------------------------------------------------ the needle */

test("the needle value cannot be produced from the filler or from priors", () => {
  // If the answer is guessable, a responder scores well without retrieving
  // anything and the probe reports recall it never tested. This is the same
  // defect as a positive control that passes.
  const needle = buildNeedle(() => 0.5);
  const built = buildContext(needle, 4000, 0.5);
  const withoutStatement = built.prompt.replace(needle.statement, "");
  assert.ok(!withoutStatement.includes(needle.value), "the value leaks into the filler");
  assert.match(needle.value, /^QX[0-9A-Z]+-[0-9A-Z]+$/);
});

test("needle depth places the needle where it was asked to go", () => {
  const needle = buildNeedle(() => 0.25);
  for (const [depth, lo, hi] of [
    [0, 0, 0.1],
    [0.5, 0.4, 0.6],
    [1, 0.9, 1]
  ] as const) {
    const built = buildContext(needle, 8000, depth);
    const lines = built.prompt.split("\n");
    const at = lines.findIndex((l) => l.includes(needle.value));
    assert.ok(at >= 0, `needle absent at depth ${depth}`);
    const relative = at / (lines.length - 1);
    assert.ok(relative >= lo && relative <= hi, `depth ${depth} landed at ${relative.toFixed(2)}`);
  }
});

test("the built context is the size it is labelled", () => {
  // A size axis whose labels are systematically wrong is not a size axis. The
  // first version of the builder summed per-line token counts, each rounded up,
  // and undershot by ~5% — 8000 requested, 7573 built — with the error growing
  // as lines got shorter. 1% is tight enough to catch that returning.
  const needle = buildNeedle(() => 0.75);
  for (const size of [2000, 8000, 32000]) {
    const built = buildContext(needle, size, 0.5);
    const ratio = built.actual_tokens / size;
    assert.ok(ratio >= 0.99 && ratio <= 1.01, `${size} tokens requested, ${built.actual_tokens} built`);
  }
});

test("each cell reports what was actually sent, not only what was asked for", async () => {
  const report = await probeContextDegradation(syntheticResponder("perfect"), SELF_CHECK_GRID);
  for (const cell of report.cells) {
    const ratio = cell.actual_tokens / cell.size_tokens;
    assert.ok(ratio >= 0.99 && ratio <= 1.01, `cell labelled ${cell.size_tokens} carried ${cell.actual_tokens}`);
  }
});

test("the same seed builds the same context", () => {
  const needle = buildNeedle(() => 0.5);
  const a = buildContext(needle, 4000, 0.5, { seed: 7 });
  const b = buildContext(needle, 4000, 0.5, { seed: 7 });
  const c = buildContext(needle, 4000, 0.5, { seed: 8 });
  assert.equal(a.prompt, b.prompt);
  assert.notEqual(a.prompt, c.prompt);
});

test("distractors share the needle's shape but never its value", () => {
  const needle = buildNeedle(() => 0.5);
  const built = buildContext(needle, 40000, 0.5, { distractors: true, seed: 3 });
  const decoys = built.prompt.split("\n").filter((l) => l.includes("for a different deployment"));
  assert.ok(decoys.length > 0, "no decoys were inserted at all");
  for (const d of decoys) {
    assert.ok(!d.includes(needle.value), "a decoy carried the real value");
    assert.match(d, /QX[0-9A-Z]+-[0-9A-Z]+/, "a decoy did not share the needle's shape");
  }
});

/* -------------------------------------------------- the controls (the point) */

test("the probe separates every known responder before any real result is read", async () => {
  // A probe that reports the same shape for a perfect responder and a mid-blind
  // one is measuring nothing. The growth probe shipped exactly that defect and
  // its positive control found it after the fact; this one runs first.
  const check = await runSelfCheck();
  assert.ok(check.passed, check.detail);
  assert.ok(check.distractor_axis_is_live, check.detail);
  assert.equal(check.results.length, SELF_CHECK_CASES.length);
});

test("the control shapes are actually distinct, not all the same verdict", async () => {
  const check = await runSelfCheck();
  const shapes = new Set(check.results.map((r) => r.actual));
  // perfect / blind / mid_blind / size_limited must not collapse together.
  assert.ok(shapes.size >= 3, `controls collapsed into ${[...shapes].join(", ")}`);
});

test("a positional weakness is reported as positional, not as size", async () => {
  const report = await probeContextDegradation(
    syntheticResponder("mid_blind", SELF_CHECK_LIMIT_TOKENS),
    SELF_CHECK_GRID
  );
  assert.equal(report.shape, "degrades_in_middle", report.detail);
  assert.ok(report.recall_at_edges - report.recall_in_middle > 0.5, report.detail);
  // The distinguishing evidence: size explains none of it.
  assert.equal(report.recall_at_smallest, report.recall_at_largest);
});

test("a capacity limit is reported as size, not as position", async () => {
  const report = await probeContextDegradation(
    syntheticResponder("size_limited", SELF_CHECK_LIMIT_TOKENS),
    SELF_CHECK_GRID
  );
  assert.equal(report.shape, "degrades_with_size", report.detail);
  assert.ok(report.recall_at_smallest - report.recall_at_largest > 0.5, report.detail);
  assert.equal(report.recall_at_edges, report.recall_in_middle);
});

test("total failure is reported as its own shape, with the right advice", async () => {
  const report = await probeContextDegradation(syntheticResponder("blind"), SELF_CHECK_GRID);
  assert.equal(report.shape, "fails_everywhere");
  // Reporting 0% recall as a context finding would blame the context for a
  // needle that was never answerable.
  assert.match(report.detail, /not a context finding/);
});

test("the probe can falsify the premise it was built to test", async () => {
  const report = await probeContextDegradation(syntheticResponder("perfect"), SELF_CHECK_GRID);
  assert.equal(report.shape, "no_degradation_detected");
  assert.equal(report.overall_recall, 1);
  assert.match(report.detail, /does not support it/);
});

test("distractors are a separate axis: same responder, different verdict", async () => {
  // Distance and confusion are different failures. A responder that pattern
  // matches the needle's shape scores 100% on distance alone and 0% once a
  // same-shaped decoy exists; folding the two into one axis would hide that.
  const clean = await probeContextDegradation(
    syntheticResponder("distractible"),
    SELF_CHECK_GRID
  );
  const noisy = await probeContextDegradation(syntheticResponder("distractible"), {
    ...SELF_CHECK_GRID,
    distractors: true
  });
  assert.equal(clean.shape, "no_degradation_detected");
  assert.equal(noisy.shape, "fails_everywhere");
  assert.ok(clean.overall_recall - noisy.overall_recall > 0.9);
});

test("the distractor axis does not simply break everyone", async () => {
  // The other half of the axis check. An axis that corrupts the context for all
  // responders is indistinguishable from one that measures confusion, and would
  // let any negative result be blamed on distractors.
  const report = await probeContextDegradation(syntheticResponder("perfect"), {
    ...SELF_CHECK_GRID,
    distractors: true
  });
  assert.equal(report.shape, "no_degradation_detected", report.detail);
});

/* ------------------------------------------------------------ reporting */

test("every cell of the grid is measured and reported", async () => {
  const report = await probeContextDegradation(syntheticResponder("perfect"), SELF_CHECK_GRID);
  assert.equal(report.cells.length, SELF_CHECK_GRID.sizes.length * SELF_CHECK_GRID.depths.length);
  for (const size of SELF_CHECK_GRID.sizes) {
    for (const depth of SELF_CHECK_GRID.depths) {
      assert.ok(
        report.cells.some((c) => c.size_tokens === size && c.depth === depth),
        `missing cell ${size}/${depth}`
      );
    }
  }
});

test("each cell uses a fresh needle so a cached answer cannot score", async () => {
  const seen = new Set<string>();
  await probeContextDegradation((prompt) => {
    const m = /is (QX[0-9A-Z]+-[0-9A-Z]+)\./.exec(prompt);
    if (m?.[1] !== undefined) seen.add(m[1]);
    return "";
  }, SELF_CHECK_GRID);
  assert.equal(seen.size, SELF_CHECK_GRID.sizes.length * SELF_CHECK_GRID.depths.length);
});
