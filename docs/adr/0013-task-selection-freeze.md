# ADR 0013: Freeze representative and high-gap task slices

## Context

Selecting convenient tasks or known responsive Luna failures after treatment
results biases estimated gains. A high-gap slice answers a different question
from a representative workload sample.

## Options

1. Curate one mixed pilot after inspecting all runs.
2. Freeze one representative sample only.
3. Pre-register and freeze disjoint representative and high-gap slices.

## Evidence

Native-failure conditioning changes the estimand, and repeated runs do not add
independent tasks. Repository and organization reuse also create clustering.

## Decision

Adopt option 3 and enforce pool and freeze hashes. The representative slice is
not conditioned on model outcomes. The high-gap slice uses only a predeclared
native baseline and independent solvability evidence. Report slices separately.

## Consequences

Candidate construction and mechanics validation precede treatment runs. Changes
require a new freeze. Small samples remain exploratory.

## Rejected alternatives

Option 1 permits post-selection. Option 2 estimates ordinary value but may have
too little failure headroom to localize externally compensable weaknesses.

## Reversal conditions

Replace the two-slice design only with a larger pre-registered probability
sample having enough native failures for planned subgroup analysis.

