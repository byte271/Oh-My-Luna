# ADR 0011: Oracle information boundaries

Status: accepted for method validation, 2026-08-02

## Context

The v0.1 intervention packet stored all oracle categories in one file and schema
validation could not detect observation/diagnosis/plan leakage.

## Options

Independent categories only; a cumulative ladder; both without a primary
analysis; or a cumulative pre-edit ladder plus selected independent checks.

## Evidence

Independent diagnosis without context is unnatural. A cumulative design can
estimate incremental sufficiency but confounds category with accumulated
information. Verification guidance occurs after an attempted patch and cannot
be treated as the next pre-edit level. Semantic purity requires human review;
keyword and similarity checks are incomplete.

## Decision

Use L0–L5 cumulative as the primary Gate H design. Use only pre-registered
independent arms as secondary checks. Treat verification-gap guidance as a
separate staged rescue experiment. Materialize one minimal packet per assigned
task/level and omit the treatment label from model and scorer inputs.

## Consequences

The primary claim is incremental under this ordering, not standalone category
value. Later levels carry more information. Authoring and review are expensive,
and L3/L4 may be collapsed if Gate M reviewers cannot separate them reliably.

## Rejected alternatives

All-independent arms do not form a natural repair sequence. Running both full
factorial designs would multiply tiny-sample comparisons. Keeping verification
as L6 would mix pre-edit and post-edit interventions.

## Reversal conditions

Collapse adjacent levels when agreement is inadequate; reduce to native,
context, diagnostic fact, and diagnosis if that answers the causal question
more reliably.
