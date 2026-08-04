# ADR 0008: Oracle intervention ladder precedes component design

Status: accepted, 2026-08-01

Superseded in part on 2026-08-02 by ADRs 0011, 0012, and 0015: verification is
a separately timed rescue treatment, Gate H is distinct from Gate A, and Gate M
must validate the method first.

## Context

Failure labels alone are observational and can confuse early causes with later
symptoms. A retriever cannot help a task that still fails with correct context.

## Options

Build LunaGuide immediately; classify traces without interventions; or run
paired context, localization, observation, diagnosis, plan, verification, and
equal-budget treatments.

## Evidence

Loc2Repair demonstrates the value of an explicit gold-localization arm while
also showing its ceiling. Debug2Fix suggests runtime observations can matter.
No live Luna evidence exists in this repository.

## Decision

Use the full intervention ladder with oracle packets outside the agent
workspace, content hashes in receipts, treatment-blind hidden scoring, exact
model controls, and all attempts reported.

## Consequences

Oracle labels require independent validation and increase task-construction
cost. The design can distinguish retrieval, observation, diagnosis, plan, and
verification bottlenecks before training.

## Rejected alternatives

Trace classification alone is rejected because it is not causal. Building a
Guide first is rejected because it bakes in an untested bottleneck.

## Reversal conditions

Remove an oracle arm if its payload cannot be defined without revealing the
solution or if independent raters cannot distinguish it from adjacent arms.
