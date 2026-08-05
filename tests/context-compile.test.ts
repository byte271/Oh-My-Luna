import assert from "node:assert/strict";
import test from "node:test";
import {
  compileContext,
  formatManifest,
  recommendPolicy,
  type ContextDocument,
  type PositionPolicy
} from "../src/context/compile.js";
import { estimateTokens } from "../src/heldout/tokens.js";

const POLICIES: readonly PositionPolicy[] = ["as_ranked", "edge_loaded", "tail_loaded"];

function corpus(count: number, bytesEach = 400): ContextDocument[] {
  return Array.from({ length: count }, (_, i) => ({
    path: `src/file-${String(i).padStart(3, "0")}.ts`,
    content: `// file ${i}\n${"x".repeat(bytesEach)}`,
    score: count - i
  }));
}

/* ---------------------------------------------------------------- the budget */

test("the emitted context never exceeds the budget", () => {
  for (const policy of POLICIES) {
    for (const budget of [50, 200, 1000, 5000]) {
      const compiled = compileContext(corpus(40), { budgetTokens: budget, policy });
      assert.ok(
        compiled.total_tokens <= budget,
        `${policy} at budget ${budget} emitted ${compiled.total_tokens}`
      );
      // The guarantee is about the emitted text, not about the bookkeeping.
      assert.equal(compiled.total_tokens, estimateTokens(compiled.text));
    }
  }
});

test("the reserve is deducted before any document is considered", () => {
  const full = compileContext(corpus(40), { budgetTokens: 2000 });
  const reserved = compileContext(corpus(40), { budgetTokens: 2000, reserveTokens: 1500 });
  assert.ok(reserved.total_tokens <= 500, `reserve ignored: ${reserved.total_tokens}`);
  assert.ok(reserved.included.length < full.included.length);
});

test("a budget too small for anything yields an empty context, not an over-budget one", () => {
  // The header alone costs ~12 tokens. Emitting it under a 1-token budget
  // breaches the guarantee, and announces files that are not there.
  const compiled = compileContext(corpus(5), { budgetTokens: 1 });
  assert.equal(compiled.included.length, 0);
  assert.equal(compiled.text, "");
  assert.equal(compiled.total_tokens, 0);
  assert.equal(compiled.excluded.length, 5);
});

/* ------------------------------------------------------------- the manifest */

test("every input document is accounted for exactly once", () => {
  // The failure this forbids is the harness's own recurring defect: a report
  // that is true about everything it lists while saying nothing about what it
  // omitted. A document that is neither included nor excluded has vanished.
  const docs = corpus(40);
  for (const budget of [50, 300, 900, 10_000]) {
    const compiled = compileContext(docs, { budgetTokens: budget });
    const paths = [...compiled.included.map((d) => d.path), ...compiled.excluded.map((d) => d.path)];
    assert.equal(paths.length, docs.length, `budget ${budget}`);
    assert.deepEqual([...paths].sort(), docs.map((d) => d.path).sort());
  }
});

test("every exclusion carries a reason a caller can act on", () => {
  const compiled = compileContext(
    [
      ...corpus(20),
      { path: "src/empty.ts", content: "   \n  ", score: 999 },
      { path: "src/huge.ts", content: "y".repeat(100_000), score: 998 },
      { path: "src/file-000.ts", content: "a duplicate", score: 997 }
    ],
    { budgetTokens: 600 }
  );
  const reasons = new Set(compiled.excluded.map((d) => d.reason));
  assert.ok(reasons.has("empty"));
  assert.ok(reasons.has("exceeds_budget_alone"));
  assert.ok(reasons.has("duplicate_path"));
  assert.ok(reasons.has("over_budget"));
  for (const doc of compiled.excluded) {
    assert.ok(doc.detail.length > 20, `${doc.path} has no actionable detail`);
  }

  // The listing is capped, but the manifest must still account for every
  // document it does not name. A summary that quietly drops the tail is the
  // same defect as a context that quietly drops a file.
  const manifest = formatManifest(compiled);
  for (const [reason, count] of new Map(
    [...new Set(compiled.excluded.map((d) => d.reason))].map((r) => [
      r,
      compiled.excluded.filter((d) => d.reason === r).length
    ])
  )) {
    assert.ok(manifest.includes(`${reason} (${count})`), `manifest does not state the ${reason} count`);
  }
  const named = compiled.excluded.filter((d) => manifest.includes(d.path)).length;
  const summarised = [...manifest.matchAll(/… and (\d+) more/g)].reduce((s, m) => s + Number(m[1]), 0);
  assert.equal(named + summarised, compiled.excluded.length, "the manifest loses documents");
});

test("a file too large to ever fit is named as such, not lumped in with over-budget", () => {
  // These need different actions: one means 'raise the budget or excerpt this
  // file', the other means 'this ranked below the cut'. One reason for both
  // sends the caller looking in the wrong place.
  const compiled = compileContext(
    [{ path: "src/huge.ts", content: "y".repeat(40_000), score: 10 }, ...corpus(3)],
    { budgetTokens: 500 }
  );
  const huge = compiled.excluded.find((d) => d.path === "src/huge.ts");
  assert.equal(huge?.reason, "exceeds_budget_alone");
  assert.match(huge?.detail ?? "", /cannot fit at any ranking/);
});

/* -------------------------------------------------------------- the policies */

test("policy changes ordering and NOTHING else", () => {
  // The property that makes a policy A/B an experiment about position. If
  // membership moved with the policy, a measured difference could be content
  // rather than placement, and the comparison would be unreadable — the exact
  // confound that voided the first scoring run of comparison 02.
  const docs = corpus(40);
  const budget = 900;
  const baseline = compileContext(docs, { budgetTokens: budget, policy: "as_ranked" });
  const membership = [...baseline.included.map((d) => d.path)].sort();

  for (const policy of POLICIES) {
    const compiled = compileContext(docs, { budgetTokens: budget, policy });
    assert.deepEqual([...compiled.included.map((d) => d.path)].sort(), membership, policy);
    assert.equal(compiled.total_tokens, baseline.total_tokens, policy);
    assert.deepEqual(
      [...compiled.excluded.map((d) => d.path)].sort(),
      [...baseline.excluded.map((d) => d.path)].sort(),
      policy
    );
  }
});

test("the policies actually produce different orderings", () => {
  // The other half: a 'policy' every branch of which returns the same order is
  // a knob connected to nothing, and would pass the test above trivially.
  const docs = corpus(9);
  const orders = POLICIES.map((policy) =>
    compileContext(docs, { budgetTokens: 10_000, policy }).included.map((d) => d.rank).join(",")
  );
  assert.equal(new Set(orders).size, POLICIES.length, `orders collapsed: ${orders.join(" | ")}`);
});

test("edge_loaded puts the top-ranked documents at both ends and the weakest in the middle", () => {
  const compiled = compileContext(corpus(9), { budgetTokens: 10_000, policy: "edge_loaded" });
  const ranks = compiled.included.map((d) => d.rank);
  assert.equal(ranks[0], 1, "best is not at the head");
  assert.equal(ranks[ranks.length - 1], 2, "second best is not at the tail");
  const middle = ranks[Math.floor(ranks.length / 2)] ?? 0;
  assert.ok(middle >= ranks.length - 1, `middle holds rank ${middle} of ${ranks.length}`);
});

test("tail_loaded puts the most relevant document nearest the instruction", () => {
  const compiled = compileContext(corpus(9), { budgetTokens: 10_000, policy: "tail_loaded" });
  const ranks = compiled.included.map((d) => d.rank);
  assert.equal(ranks[ranks.length - 1], 1);
  assert.equal(ranks[0], ranks.length);
});

test("position reflects the emitted order, rank reflects relevance", () => {
  const compiled = compileContext(corpus(9), { budgetTokens: 10_000, policy: "edge_loaded" });
  compiled.included.forEach((doc, i) => assert.equal(doc.position, i));
  const bodies = compiled.included.map((d) => compiled.text.indexOf(`path="${d.path}"`));
  assert.deepEqual(bodies, [...bodies].sort((a, b) => a - b), "position does not match the text");
});

/* ------------------------------------------------------------------ pinning */

test("a pinned document outranks a higher-scoring one", () => {
  const docs = corpus(40);
  const target = "src/file-039.ts"; // the lowest score in the corpus
  const unpinned = compileContext(docs, { budgetTokens: 600 });
  assert.ok(!unpinned.included.some((d) => d.path === target), "precondition: should not fit");

  const compiled = compileContext(docs, { budgetTokens: 600, pinned: [target] });
  const entry = compiled.included.find((d) => d.path === target);
  assert.ok(entry, "pinned document was dropped");
  assert.equal(entry?.rank, 1);
  assert.equal(entry?.pinned, true);
});

test("a pin is never honoured by breaching the budget", () => {
  // The budget is the one guarantee this module makes. A pin that cannot fit is
  // refused loudly rather than quietly overspending.
  const compiled = compileContext(
    [{ path: "src/huge.ts", content: "y".repeat(40_000), score: 0 }, ...corpus(3)],
    { budgetTokens: 500, pinned: ["src/huge.ts"] }
  );
  assert.ok(compiled.total_tokens <= 500);
  const huge = compiled.excluded.find((d) => d.path === "src/huge.ts");
  assert.equal(huge?.reason, "exceeds_budget_alone");
  assert.match(huge?.detail ?? "", /pinned, and the pin could not be honoured/);
});

/* ------------------------------------------------------------- determinism */

test("the same input compiles to byte-identical output", () => {
  const docs = corpus(40);
  for (const policy of POLICIES) {
    const a = compileContext(docs, { budgetTokens: 900, policy });
    const b = compileContext(docs, { budgetTokens: 900, policy });
    assert.equal(a.text, b.text, policy);
    assert.deepEqual(a.included, b.included, policy);
  }
});

test("input order does not change the result when scores are equal", () => {
  // Ties broken by insertion order would make two runs over the same repository
  // disagree because the filesystem walked it differently.
  const flat = (paths: string[]): ContextDocument[] =>
    paths.map((path) => ({ path, content: "x".repeat(200), score: 1 }));
  const a = compileContext(flat(["b.ts", "a.ts", "c.ts"]), { budgetTokens: 10_000 });
  const b = compileContext(flat(["c.ts", "b.ts", "a.ts"]), { budgetTokens: 10_000 });
  assert.equal(a.text, b.text);
  assert.deepEqual(a.included.map((d) => d.path), ["a.ts", "b.ts", "c.ts"]);
});

test("the budget cut stops the fill: a smaller document is not promoted past a larger one", () => {
  // Greedy-with-skipping makes membership depend on byte sizes higher up the
  // ranking, so an unrelated edit reshuffles the context and two runs stop being
  // comparable for reasons that have nothing to do with relevance. c.ts fits in
  // the space left, and is excluded anyway.
  const docs: ContextDocument[] = [
    { path: "a.ts", content: "a".repeat(600), score: 30 },
    { path: "b.ts", content: "b".repeat(400), score: 20 },
    { path: "c.ts", content: "c".repeat(40), score: 10 }
  ];
  const compiled = compileContext(docs, { budgetTokens: 200 });
  assert.deepEqual(compiled.included.map((d) => d.path), ["a.ts"]);
  const b = compiled.excluded.find((d) => d.path === "b.ts");
  const c = compiled.excluded.find((d) => d.path === "c.ts");
  assert.equal(b?.reason, "over_budget");
  assert.match(b?.detail ?? "", /This is the budget cut/);
  assert.match(b?.detail ?? "", /would have fit in the space left/);
  assert.equal(c?.reason, "over_budget");
  assert.match(c?.detail ?? "", /below the budget cut at rank 2/);
});

test("a file too large to ever fit is skipped, and the fill continues past it", () => {
  // The other half of the cut rule. This document's fate does not depend on
  // anything above it, so skipping it is stable — and stopping here would let a
  // single oversized file blank the whole context.
  const docs: ContextDocument[] = [
    { path: "a.ts", content: "a".repeat(200), score: 30 },
    { path: "huge.ts", content: "b".repeat(40_000), score: 20 },
    { path: "c.ts", content: "c".repeat(200), score: 10 }
  ];
  const compiled = compileContext(docs, { budgetTokens: 400 });
  assert.deepEqual(compiled.included.map((d) => d.path), ["a.ts", "c.ts"]);
  assert.equal(compiled.excluded.find((d) => d.path === "huge.ts")?.reason, "exceeds_budget_alone");
});

/* ------------------------------------------------- measurement drives policy */

test("no measured degradation recommends no rearrangement", () => {
  // A recommender that always suggests moving things would be presenting a
  // hypothesis as a finding.
  const rec = recommendPolicy("no_degradation_detected");
  assert.equal(rec.policy, "as_ranked");
  assert.match(rec.rationale, /nothing for a position policy to correct/);
});

test("a positional failure recommends edge loading; a capacity failure does not", () => {
  assert.equal(recommendPolicy("degrades_in_middle").policy, "edge_loaded");
  assert.equal(recommendPolicy("degrades_with_size_and_in_middle").policy, "edge_loaded");

  const size = recommendPolicy("degrades_with_size");
  assert.equal(size.policy, "as_ranked");
  assert.match(size.rationale, /fewer tokens, not different tokens/);
});

test("a broken measurement recommends fixing the measurement, not the mechanism", () => {
  const rec = recommendPolicy("fails_everywhere");
  assert.equal(rec.policy, "as_ranked");
  assert.match(rec.rationale, /fix the probe before changing the mechanism/);
});
