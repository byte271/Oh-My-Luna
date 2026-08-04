# ADR 0004: Evidence model

## Context

Agent text, test output, and artifacts are easy to confuse with proof. Later
changes can make earlier observations stale.

## Options

1. Prompt-only “verify your work.”
2. Mutable checklist state.
3. Append-only typed evidence with dependencies and invalidation.
4. Full formal proof system.

## Evidence

OpenAI recommends trace grading and repeatable evals. SkillsBench uses
deterministic verifiers. OpenHands uses event sourcing and replay. Existing
tests can miss the requested behavior, and current research shows coding agents
optimize to what is checked.

## Decision

Use hash-linked events, content-addressed artifacts, typed claims, provenance,
and dependency invalidation. Keep small-task claim sets small.

## Consequences

Receipts are auditable and stale tests cannot silently satisfy new code.
Evidence still cannot prove omitted human intent.

## Rejected alternatives

Prompt-only checks are unenforceable. Mutable checklists are forgeable and lose
history. Full formal proof is infeasible for V0 repository tasks.

## Reversal conditions

Simplify if it fails the false-completion benefit threshold or causes excessive
timeouts; strengthen specific claim types if high-stakes tasks require it.

