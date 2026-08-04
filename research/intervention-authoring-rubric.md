# Intervention authoring rubric

Status: method specification; no capability result  
Rubric version: `oracle-boundary/1.0.0`  
Date: 2026-08-02

## Primary design

The primary Gate H analysis is a cumulative pre-edit ladder. Each packet is a
separate control-plane file containing only the components permitted at that
level. The model never receives a file containing unused later-level fields.

| Level | Cumulative payload | Causal interpretation |
|---|---|---|
| L0 native | no assistance | minimal-harness baseline |
| L1 context | relevant file and line ranges | gain from correct regions |
| L2 localization | L1 plus exact base-state symbols and failing boundary | incremental gain from precise localization |
| L3 observation | L2 plus raw decisive runtime fact | incremental gain from decisive behavior evidence |
| L4 diagnosis | L3 plus causal mechanism | incremental gain from correct root cause |
| L5 plan | L4 plus behavioral objective, constraints, and non-goals | incremental gain from an actionable but non-implementational objective |

`verification_gap` is not L6. It is a separate staged rescue treatment delivered
only after a frozen first patch and first verification result. Combining it with
the pre-edit ladder would change treatment timing and make the increment
uninterpretable.

Selected independent L1–L5 arms are secondary and exploratory. An independent
packet contains exactly one component. It estimates standalone usefulness, not
the incremental effect in the primary ladder. Gate H must name these arms before
outcomes are observed; it must not run every independent combination.

## Information boundaries

### L1 — Context

Allowed: base-repository paths and bounded line ranges independently known to be
relevant. No prose reason is included.

Forbidden: symbol ranking, failing boundary, runtime result, causal explanation,
repair objective, implementation hint, fixed-only identifier, patch text, hidden
test name, or fixed commit.

Specificity: at most the pre-registered number of regions and total lines. These
budgets are fixed per study, not tuned per outcome.

Compliant: `src/cache.ts:120-188`.

Leaking: `src/cache.ts:120-188 because the stale callback writes current state`.

### L2 — Localization

Allowed: L1 plus exact symbols present in the base tree, their kinds, and a
structural failing boundary expressed as producer/consumer symbols and a bounded
boundary type. No explanatory prose.

Forbidden: observed values, temporal sequence, causal mechanism, desired guard,
control-flow change, patch text, or fixed-only identifier.

Compliant: producer `scheduleCallback`, consumer `handleResult`, boundary type
`async_callback`.

Leaking: `handleResult accepts callbacks from the previous generation`.

### L3 — Observation

Allowed: L2 plus raw, execution-grounded facts and evidence references. Facts
state what happened, with concrete values and timing where known. Uncertainty is
`observed`, `inferred_from_trace`, or `uncertain`.

Forbidden: why it happened, fault attribution, normative language, repair verbs,
counterfactual fix behavior, or suggested code.

Compliant: “After cancellation, callback X executes once with generation=4
while the active generation is 5.”

Leaking: “An old callback corrupts the new generation, so add a generation
comparison before writing state.”

### L4 — Diagnosis

Allowed: L3 plus one causal mechanism supported by named evidence references.
It may explain why the observed behavior violates the requested invariant.

Forbidden: code snippets, exact conditions, assignment expressions, line-level
edit instructions, repair verbs tied to identifiers, or a prescribed algorithm.

Compliant: “The failure occurs because callbacks created for an earlier
generation remain authorized to mutate the current generation.”

Leaking: “Add `if callbackGeneration !== currentGeneration return` in
`handleResult`.”

### L5 — Plan

Allowed: L4 plus a behavioral objective, externally visible constraints, and
explicit non-goals. The objective describes post-fix behavior, not edit steps.

Forbidden: line numbers, exact condition syntax, patch hunks, file-edit
instructions, prescribed local variable names, or an implementation sequence.

Compliant: “Prevent stale-generation callbacks from mutating current state while
preserving valid callbacks from the active generation.”

Leaking: “Insert the following condition at line 182.”

### Verification-gap rescue

Allowed after the frozen first attempt: the requested behavior that remains
unproven and categories of evidence needed.

Forbidden: hidden-test source/name, expected assertion literals, fixed patch,
diagnosis not already present in the assigned pre-edit arm, or a new plan.

## Source and uncertainty

Every component cites control-plane evidence references. Historical patches may
help an author establish truth but are never copied into the packet. Each fact
records whether it was visible or reproducible from the base state. Synthetic
mechanics fixtures use `synthetic_mechanics_only` and cannot support capability
claims.

Uncertainty is explicit. Oracle packets should normally contain correct
information; when an exact boundary cannot be established, the task is excluded
rather than disguising a hypothesis as an oracle.

## Review workflow

1. Author creates one task/level packet without access to other-arm outputs.
2. The authoring tool checks schema, self-hash, component set, hidden paths,
   base-state identifiers, suspicious language, and similarity to hidden oracle
   material.
3. A reviewer independently assigns the permitted level and leak classification.
4. A second reviewer is required for capability studies when available. Gate M
   records a one-reviewer limitation rather than fabricating independence.
5. Any disagreement sets the record to `revision_required` until a resolution
   and new packet revision are recorded.
6. The final review file and packet are hashed into the experiment freeze.

Automated findings are warnings or deterministic policy violations. They do not
prove semantic purity. Reviewers use the strongest-information test: if a
reasonable reader can infer a later-level answer from the payload, assign the
later level or reject the packet.

## Minimum sufficient intervention

Before Gate H, register a minimum meaningful paired effect and payload budgets.
The minimum sufficient level is the earliest cumulative level that:

1. exceeds the registered effect on independent tasks;
2. is not explained by detected solution leakage;
3. stays within file, line, symbol, fact, constraint, and token budgets;
4. survives repository-disjoint held-out evaluation; and
5. is not credibly improved by later levels enough to justify their extra
   specificity.

Track payload tokens, regions, lines, symbols, facts, constraints, patch-token
similarity, fixed-only identifier count, successes, harmful outcomes, and cost.
The highest-scoring level is not automatically the minimum sufficient level.
