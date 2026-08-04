# ADR 0002: Capability registry

## Context

Luna needs a small, predictable tool surface while repository tasks need
specialized observations.

## Options

1. Expose all low-level tools.
2. Fixed macro tools only.
3. Versioned primitives + macros + declarative composition.
4. Generate a new tool for every task.

## Evidence

Debug2Fix found direct low-level debugger tools flat or harmful while one
high-level interface improved results. SkillsBench favors curated focused
procedures and finds no average gain from self-generated skills. CodeAct shows
executable actions can help, but expands the sandbox boundary.

## Decision

Use a four-tier registry, with V0 executing Tiers 0-2 and Tier 3 disabled.
Resolve exact typed contracts before semantic retrieval.

## Consequences

More curation and tests per capability, but a smaller Luna-facing surface and
clear ablations. Composition must be permission-monotone.

## Rejected alternatives

All-tools exposure increases selection and orchestration errors. Fixed macros
alone cannot express every task-specific probe. Generation-first is insecure
and unsupported by current self-generation evidence.

## Reversal conditions

Use fixed macros only if composition adds no held-out gain. Enable Tier 3 only
after its correctness, utility, and isolation thresholds pass.

