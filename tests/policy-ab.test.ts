import assert from "node:assert/strict";
import test from "node:test";
import { syntheticResponder } from "../src/probes/context-degradation.js";
import {
  buildPolicyCorpus,
  comparePolicies,
  formatPolicyComparison,
  sweepNeedleRank,
  type RankReach
} from "../src/probes/policy-ab.js";
import type { PositionPolicy } from "../src/context/compile.js";

const BIG = 100_000;
const reach = (rs: readonly RankReach[], p: PositionPolicy): number =>
  rs.find((r) => r.policy === p)?.deepest_contiguous_rank ?? -1;

/* ------------------------------------------------- the harness's own controls */

test("policy does not change the answer for a responder that reads everything", () => {
  // The integration-level version of the compiler's unit test. If a policy
  // changed a perfect responder's recall, the arms would differ in CONTENT, not
  // just order, and every comparison below would be unreadable.
  return sweepNeedleRank(syntheticResponder("perfect"), {
    documentCount: 20,
    budgetTokens: BIG
  }).then((reaches) => {
    for (const r of reaches) {
      assert.equal(r.deepest_contiguous_rank, 20, `${r.policy} lost a rank a perfect responder should recall`);
    }
  });
});

test("membership is identical across arms, and a comparison is void without it", async () => {
  const corpus = buildPolicyCorpus({ documentCount: 20, needleRank: 5 });
  const comparison = await comparePolicies(syntheticResponder("perfect"), corpus, { budgetTokens: BIG });
  assert.equal(comparison.membership_identical, true);
  assert.notEqual(comparison.verdict, "comparison_void");
  // Every arm holds the same document count, which is the observable consequence.
  assert.equal(new Set(comparison.trials.map((t) => t.included)).size, 1);
  assert.equal(new Set(comparison.trials.map((t) => t.total_tokens)).size, 1);
});

test("a responder that recalls nothing is reported as such, not as a policy finding", async () => {
  const corpus = buildPolicyCorpus({ documentCount: 20, needleRank: 3 });
  const comparison = await comparePolicies(syntheticResponder("blind"), corpus, { budgetTokens: BIG });
  assert.equal(comparison.verdict, "recalled_nowhere");
  assert.equal(comparison.best, null);
});

/* ----------------------------------------------------------- the real result */

test("edge loading reaches twice as deep into the ranking as no policy at all", async () => {
  // Not circular: the compiler knows nothing about the responder. It reorders by
  // rank, and whether that rescues a mid-context weakness depends on where the
  // ranker put the needed document — a mechanical fact that could come out
  // either way, and does come out differently for the three policies.
  const reaches = await sweepNeedleRank(syntheticResponder("mid_blind"), {
    documentCount: 20,
    budgetTokens: BIG
  });
  assert.equal(reach(reaches, "as_ranked"), 3);
  assert.equal(reach(reaches, "edge_loaded"), 6);
  assert.equal(reach(reaches, "tail_loaded"), 3);
});

test("the edge budget is fixed; the policy decides who spends it", async () => {
  // The sharper finding. All three policies recall the SAME NUMBER of ranks —
  // the number of edge slots is a property of the context, not of the policy.
  // What differs is which ranks get them: as_ranked spends half its edge slots
  // on the three LEAST relevant documents in the corpus.
  const reaches = await sweepNeedleRank(syntheticResponder("mid_blind"), {
    documentCount: 20,
    budgetTokens: BIG
  });
  assert.equal(new Set(reaches.map((r) => r.recalled_ranks.length)).size, 1, "edge capacity differed by policy");

  const asRanked = reaches.find((r) => r.policy === "as_ranked")?.recalled_ranks ?? [];
  const edgeLoaded = reaches.find((r) => r.policy === "edge_loaded")?.recalled_ranks ?? [];
  assert.deepEqual(asRanked, [1, 2, 3, 18, 19, 20]);
  assert.deepEqual(edgeLoaded, [1, 2, 3, 4, 5, 6]);
});

test("beyond its reach, no policy helps — and that is reported as the limit it is", async () => {
  const corpus = buildPolicyCorpus({ documentCount: 20, needleRank: 10 });
  const comparison = await comparePolicies(syntheticResponder("mid_blind"), corpus, { budgetTokens: BIG });
  assert.equal(comparison.verdict, "recalled_nowhere");
  assert.equal(comparison.needle_included, true);
  assert.match(comparison.detail, /limit of the mechanism, not a tuning problem/);
});

test("a needle at rank 5 separates the three policies, with the geometry to explain why", async () => {
  const corpus = buildPolicyCorpus({ documentCount: 20, needleRank: 5 });
  const comparison = await comparePolicies(syntheticResponder("mid_blind"), corpus, { budgetTokens: BIG });
  assert.equal(comparison.verdict, "policy_changed_recall");
  assert.equal(comparison.best, "edge_loaded");

  const depth = (p: PositionPolicy): number =>
    comparison.trials.find((t) => t.policy === p)?.needle_line_depth ?? -1;
  // edge_loaded pulls rank 5 toward the head; tail_loaded pushes it past centre.
  assert.ok(depth("edge_loaded") < depth("as_ranked"), formatPolicyComparison(comparison));
  assert.ok(depth("as_ranked") < depth("tail_loaded"), formatPolicyComparison(comparison));
});

/* ---------------------------------------------------------- excluded material */

test("material the budget excluded is not a position problem", async () => {
  // No reordering can help a document that is not in the context. Reporting this
  // as a policy result would send the caller to tune the wrong knob.
  const corpus = buildPolicyCorpus({ documentCount: 40, needleRank: 39 });
  const comparison = await comparePolicies(syntheticResponder("perfect"), corpus, { budgetTokens: 900 });
  assert.equal(comparison.needle_included, false);
  assert.equal(comparison.verdict, "recalled_nowhere");
  assert.match(comparison.detail, /did not survive the budget/);
  assert.match(comparison.detail, /raise the budget or improve the ranking/);
});

/* ------------------------------------------------------------- the sweep math */

test("reach is contiguous from rank 1, so a lucky deep hit cannot inflate it", async () => {
  // as_ranked recalls ranks 18-20 because as_ranked puts the WORST documents at
  // the tail. Counting those would report it as reaching rank 20, which would
  // overstate the mechanism by a factor of six.
  const reaches = await sweepNeedleRank(syntheticResponder("mid_blind"), {
    documentCount: 20,
    budgetTokens: BIG
  });
  const asRanked = reaches.find((r) => r.policy === "as_ranked");
  assert.ok(asRanked?.recalled_ranks.includes(20), "precondition: a deep rank IS recalled");
  assert.equal(asRanked?.deepest_contiguous_rank, 3, "a non-contiguous hit inflated the reach");
});

test("the corpus builder puts the needle at the rank it was asked for", () => {
  for (const rank of [1, 5, 12, 20]) {
    const corpus = buildPolicyCorpus({ documentCount: 20, needleRank: rank });
    assert.equal(corpus.needle_rank, rank);
    const doc = corpus.documents.find((d) => d.path === corpus.needle_path);
    assert.ok(doc?.content.includes(corpus.needle.value), `needle absent at rank ${rank}`);
    // Scores are strictly descending, so the rank is the position with no ties.
    const sorted = [...corpus.documents].sort((a, b) => b.score - a.score);
    assert.equal(sorted[rank - 1]?.path, corpus.needle_path);
  }
});

test("the same seed builds the same corpus", () => {
  const a = buildPolicyCorpus({ documentCount: 10, needleRank: 4, seed: 99 });
  const b = buildPolicyCorpus({ documentCount: 10, needleRank: 4, seed: 99 });
  assert.equal(a.needle.value, b.needle.value);
  assert.deepEqual(a.documents, b.documents);
});
