# ADR 0015: Validate the method before capability experiments

## Context

Schema-valid packets can still leak solutions, and a runner can accidentally
expose hidden material or conflate verifier success with terminal evidence.

## Options

1. Begin the 12–20-task pilot and repair methodology afterward.
2. Require a four-to-six-task Gate M for mechanics and semantic review.
3. Rely on unit tests only.

## Evidence

The repository has no live Luna results. Current automated checks detect only
obvious leakage; reviewer agreement and treatment confidentiality are empirical
properties of the method.

## Decision

Adopt option 2. Gate M yields no capability claim and is required before Gate H.

## Consequences

PR #1 remains a draft until task bundles and independent semantic review pass.
Mechanical fixtures are retained as regression tests but cannot satisfy the
human-review requirement.

## Rejected alternatives

Option 1 contaminates the study. Option 3 cannot validate semantic boundaries
or model-facing isolation end to end.

## Reversal conditions

The gate may be simplified only when a smaller validation set demonstrably
exercises every confidentiality, freeze, review, receipt, and failure boundary.

