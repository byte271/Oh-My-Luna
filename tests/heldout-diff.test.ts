import assert from "node:assert/strict";
import test from "node:test";
import { diffReturnedFile, summarizeAttemptDiff } from "../src/heldout/diff.js";

const lines = (...xs: string[]) => `${xs.join("\n")}\n`;

test("an identical reproduction records no change", () => {
  const text = lines("a", "b", "c");
  const d = diffReturnedFile("f.ts", text, text);
  assert.equal(d.identical, true);
  assert.equal(d.hunks_changed, 0);
  assert.equal(d.lines_added, 0);
  assert.equal(d.lines_removed, 0);
});

test("a one-line repair is one hunk", () => {
  const d = diffReturnedFile("f.ts", lines("a", "bad", "c"), lines("a", "good", "c"));
  assert.equal(d.hunks_changed, 1);
  assert.equal(d.lines_added, 1);
  assert.equal(d.lines_removed, 1);
});

test("edits scattered across a file are counted as separate hunks", () => {
  // This is the case v1 could not see: a correct repair plus collateral damage
  // elsewhere in the same file scored identically to never finding the bug.
  const base = lines("a", "b", "c", "d", "e", "f", "g", "h", "i");
  const returned = lines("a", "B", "c", "d", "e", "f", "g", "H", "i");
  const d = diffReturnedFile("f.ts", base, returned);
  assert.equal(d.hunks_changed, 2);
  assert.equal(d.lines_added, 2);
  assert.equal(d.lines_removed, 2);
});

test("edits outside the cited region are counted separately", () => {
  const base = lines("a", "b", "c", "d", "e", "f", "g", "h", "i");
  const returned = lines("a", "B", "c", "d", "e", "f", "g", "H", "i");
  const d = diffReturnedFile("f.ts", base, returned, { citedRegions: [{ start_line: 1, end_line: 3 }] });
  assert.equal(d.changed_regions_outside_cited_regions, 1);
});

test("pure insertion and pure deletion are handled", () => {
  const grow = diffReturnedFile("f.ts", lines("a", "b"), lines("a", "x", "y", "b"));
  assert.equal(grow.lines_added, 2);
  assert.equal(grow.lines_removed, 0);

  const shrink = diffReturnedFile("f.ts", lines("a", "x", "y", "b"), lines("a", "b"));
  assert.equal(shrink.lines_added, 0);
  assert.equal(shrink.lines_removed, 2);
});

test("truncation to nothing and expansion from nothing are handled", () => {
  const emptied = diffReturnedFile("f.ts", lines("a", "b", "c"), "");
  assert.equal(emptied.lines_removed, 3);
  assert.equal(emptied.returned_line_count, 0);

  const filled = diffReturnedFile("f.ts", "", lines("a", "b"));
  assert.equal(filled.lines_added, 2);
});

test("line-ending and trailing-newline changes are recorded, not silently normalized", () => {
  // A model that rewrites CRLF to LF while reproducing a file has corrupted it
  // on Windows checkouts even if every logical line matches.
  const d = diffReturnedFile("f.ts", "a\r\nb\r\n", "a\nb\n");
  assert.equal(d.line_ending_changed, true);
  assert.equal(d.hunks_changed, 0, "logical lines are unchanged");

  const t = diffReturnedFile("f.ts", "a\nb\n", "a\nb");
  assert.equal(t.trailing_newline_changed, true);
});

test("a wholesale rewrite is reported as truncated, never as a small diff", () => {
  const base = lines(...Array.from({ length: 400 }, (_, i) => `base line ${i}`));
  const returned = lines(...Array.from({ length: 400 }, (_, i) => `totally different ${i}`));
  const d = diffReturnedFile("f.ts", base, returned, { maxEditDistance: 50 });
  assert.equal(d.truncated, true);
  assert.ok(d.lines_added > 0 && d.lines_removed > 0);
});

test("added minus removed always equals the line-count delta", () => {
  // The invariant any correct edit script must satisfy. Fuzzed rather than
  // asserted on hand-picked cases, because an off-by-one in the backtrack
  // shows up here and nowhere else.
  // mulberry32. A textbook LCG is wrong here: `seed * 1103515245` exceeds 2^53,
  // so the low bits round away in a double and every draw comes back 0.
  let seed = 20260804;
  const rand = (n: number) => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) % n;
  };
  let checked = 0;
  for (let trial = 0; trial < 300; trial += 1) {
    const baseLines = Array.from({ length: rand(40) + 1 }, () => `L${rand(12)}`);
    const returnedLines = baseLines
      .filter(() => rand(4) !== 0)
      .flatMap((l) => (rand(5) === 0 ? [l, `N${rand(12)}`] : [l]));
    // An empty array would render as "\n", which is a file holding one empty
    // line rather than an empty file — a different case, covered above.
    if (returnedLines.length === 0) continue;
    const d = diffReturnedFile("f.ts", `${baseLines.join("\n")}\n`, `${returnedLines.join("\n")}\n`);
    if (d.truncated) continue;
    checked += 1;
    assert.equal(d.base_line_count, baseLines.length);
    assert.equal(d.returned_line_count, returnedLines.length);
    assert.equal(
      d.lines_added - d.lines_removed,
      returnedLines.length - baseLines.length,
      `trial ${trial}: +${d.lines_added} -${d.lines_removed} for ${baseLines.length}->${returnedLines.length}`
    );
  }
  assert.ok(checked > 200, `only ${checked} trials exercised the invariant`);
});

test("diff metadata never turns a failure into a success", () => {
  const clean = diffReturnedFile("f.ts", lines("a", "b"), lines("a", "b"));
  const failing = summarizeAttemptDiff([clean], { taskSucceeded: false });
  const passing = summarizeAttemptDiff([clean], { taskSucceeded: true });
  // The summary describes; it carries no success field at all.
  assert.equal("task_success" in failing, false);
  assert.equal(passing.unrelated_edit_suspected, false);
});

test("a failing attempt with scattered edits is flagged for inspection", () => {
  const base = lines(...Array.from({ length: 30 }, (_, i) => `line ${i}`));
  const returned = lines(...Array.from({ length: 30 }, (_, i) => (i % 5 === 0 ? `changed ${i}` : `line ${i}`)));
  const d = diffReturnedFile("f.ts", base, returned);
  assert.ok(d.hunks_changed > 3);
  assert.equal(summarizeAttemptDiff([d], { taskSucceeded: false }).unrelated_edit_suspected, true);
  // The same diff on a passing attempt is not flagged: the flag exists to
  // explain failures, not to second-guess passes.
  assert.equal(summarizeAttemptDiff([d], { taskSucceeded: true }).unrelated_edit_suspected, false);
});
