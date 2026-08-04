# ADR 0007: Intelligence source remains unselected

Status: accepted for the research phase, 2026-08-01

## Context

The implemented kernel delegates all semantic diagnosis to the external model
adapter. Deterministic context and evidence mechanisms can improve information
shape and truth discipline but do not necessarily supply a missing hypothesis.

## Options

Native Luna; fixed Skill; deterministic ranking/probes; trained retriever;
trained diagnostic/verifier; equal-budget search; explicit Luna/Sol hybrid; or a
full learned scaffold.

## Evidence

The repository audit found no implemented intelligence source or live result.
Loc2Repair shows that gold files yielded a limited end-to-end lift and left most
repairs unsolved. SHERLOC reports gains from training-free diagnosis. SkillsBench
and SWE-Skills-Bench show skills are heterogeneous and can regress.

## Decision

Reserve one replaceable assistance slot. Select its implementation only from a
paired oracle-intervention study. Luna remains the normal-mode patch author;
Sol is never hidden.

## Consequences

Training and broad runtime expansion pause. The immediate product is accurately
described as an evaluation kernel. The first improvement, if any, is easier to
attribute.

## Rejected alternatives

A general LunaGuide, trained verifier, adaptive workflow, and multi-agent search
are rejected as defaults because no measured bottleneck requires them.

## Reversal conditions

Adopt a component only if it beats native, equal-cost, and strongest simpler
baseline on repository-disjoint end-to-end success with acceptable harmful
guidance and cost.
