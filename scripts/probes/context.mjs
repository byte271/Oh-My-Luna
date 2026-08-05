// Long-context instrument: self-check, then measurement, then mechanism.
//
// The self-check runs FIRST and the script exits without printing any
// measurement if the controls do not separate. A probe that has not been shown
// to distinguish known-different responders has established nothing about an
// unknown one, however plausible its output looks — this repository has already
// published one verdict from a probe that gave a catastrophic implementation and
// two sound ones the same answer.
//
// Exit codes:
//   0  controls separated, and the demonstration ran
//   1  the controls did NOT separate — the probe is not trustworthy, nothing
//      below it would have meant anything
//
// Run: npm run probe:context

import {
  formatDegradation,
  formatSelfCheck,
  probeContextDegradation,
  runSelfCheck,
  syntheticResponder
} from "../../dist/src/probes/context-degradation.js";
import { sweepNeedleRank } from "../../dist/src/probes/policy-ab.js";
import { compileRepositoryContext, formatManifest, recommendPolicy } from "../../dist/src/index.js";

const out = (s) => process.stdout.write(`${s}\n`);

out("=== controls: the probe MUST separate these before any result is read ===\n");
const check = await runSelfCheck();
out(formatSelfCheck(check));
if (!check.passed) {
  out("\nFATAL: the controls did not separate. The probe is not measuring what it claims.");
  out("No measurement is printed, because none of it would have meant anything.");
  process.exit(1);
}

out("\n=== what a measurement looks like (synthetic mid-blind responder) ===\n");
const measured = await probeContextDegradation(syntheticResponder("mid_blind"), {
  sizes: [2000, 8000, 32000],
  depths: [0, 0.25, 0.5, 0.75, 1]
});
out(formatDegradation(measured));

out("\n=== the mechanism that shape selects ===\n");
const recommendation = recommendPolicy(measured.shape);
out(`  shape ${measured.shape} → policy ${recommendation.policy}`);
out(`  ${recommendation.rationale}`);

// A corpus large enough that the budget actually bites, so the manifest has
// something to report. Content is synthetic; the point is the bookkeeping.
const documents = Array.from({ length: 60 }, (_, i) => ({
  path: `src/module-${String(i).padStart(2, "0")}.ts`,
  content:
    i === 7
      ? `export function readCacheKey(id: string): string {\n  return \`cache:\${id}\`;\n}\n${"// filler\n".repeat(40)}`
      : `export const value${i} = ${i};\n${"// filler\n".repeat(60)}`,
  recent_history_touches: i % 5
}));

out("\n=== compiled context (budget enforced, exclusions accounted for) ===\n");
const compiled = compileRepositoryContext("readCacheKey returns a stale cache key", documents, {
  budgetTokens: 4000,
  reserveTokens: 500,
  policy: recommendation.policy
});
out(formatManifest(compiled));
out(
  `\n  ${compiled.included.length + compiled.excluded.length} documents in, ` +
    `${compiled.included.length} included, ${compiled.excluded.length} excluded, ` +
    `${compiled.total_tokens}/${compiled.budget_tokens} tokens used.`
);

out("\n=== does the recommended policy actually help? ===\n");
out("  How deep into the ranking each policy keeps material out of mid-context,");
out("  for a responder with a KNOWN mid-context blind spot. 20 documents.\n");

for (const behaviour of ["perfect", "mid_blind"]) {
  const reaches = await sweepNeedleRank(syntheticResponder(behaviour), {
    documentCount: 20,
    budgetTokens: 100_000
  });
  out(`  ${behaviour}:`);
  for (const r of reaches) {
    out(
      `    ${r.policy.padEnd(12)} reaches rank ${String(r.deepest_contiguous_rank).padStart(2)}` +
        `   recalled: ${r.recalled_ranks.join(",")}`
    );
  }
  out("");
}

out("  A perfect responder must be UNAFFECTED by policy — if it is not, the arms");
out("  differ in content and every row above is unreadable.");
out("");
out("  For the mid-blind responder every policy recalls the same NUMBER of ranks:");
out("  the count of edge slots belongs to the context, not to the policy. What");
out("  differs is who spends them. as_ranked gives three of its six to the three");
out("  LEAST relevant documents in the corpus; edge_loaded gives all six to the");
out("  top six. That is the mechanism, stated as a number: reach 3 -> 6, and");
out("  beyond rank 6 no reordering helps at all.");

out("\nWhat this does NOT show: that any real model has this weakness. The");
out("responders above are synthetic. Pointing the probe at Luna needs live calls");
out("this repository has never made. See docs/context-v030.md.");
