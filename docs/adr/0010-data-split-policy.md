# ADR 0010: Repository-disjoint data and hidden-oracle policy

Status: accepted, 2026-08-01

## Context

Random issue splits allow repository conventions, near-duplicate fixes, and
organization-specific patterns to leak. Historical commits and messages can
directly reveal solutions.

## Options

Random tasks; commit/issue-disjoint only; repository-disjoint; or strict
organization- and time-disjoint splits.

## Evidence

Repository repair is strongly conditioned on project structure. Recent task
factory and retrieval work uses historical artifacts whose labels can leak the
patch. No available source establishes that random splits demonstrate
cross-repository specialist generalization.

## Decision

Require commit-, issue-, and repository-disjoint splits. Report
organization-disjoint and time-separated results where enough licensed tasks
exist. Fixed commits, patch diffs, hidden verifiers, oracle packets, and labels
remain outside all agent-visible workspaces.

## Consequences

Samples are smaller and more expensive but claims are more defensible. Automated
leakage checks cover identity/path/commit leaks; semantic duplication still
needs independent review.

## Rejected alternatives

Random splits are rejected for generalization claims. Organization-disjoint is
not mandatory for every development experiment because it may make small pilots
impossible; it must be reported separately rather than implied.

## Reversal conditions

Relax a split only for mechanics tests with an explicit non-capability label.
Tighten to mandatory organization/time separation when dataset scale permits.
