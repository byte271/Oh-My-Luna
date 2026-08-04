# ADR 0012: Separate causal headroom from approximation feasibility

## Context

An oracle can reveal useful information that no affordable component can
produce. Treating oracle lift as evidence for an implementation would confuse
the value of perfect information with realizability.

## Options

1. Select a component immediately from the best oracle arm.
2. Run one mixed comparison containing oracle and practical components.
3. Use sequential Gate H and Gate A studies.

## Evidence

The distinction follows experimental logic rather than an observed Luna result:
the intervention source differs categorically between correct oracle data and
fallible generated assistance. Costs, calibration, harmful guidance, and
coverage exist only for the latter.

## Decision

Adopt option 3. Gate H estimates causal headroom with oracle interventions.
Gate A is separately frozen and estimates practical approximation value. A
positive Gate H does not authorize a learned component.

## Consequences

The project can report that an information category matters while rejecting
all current approximations. Experiments take two gates but causal claims remain
attributable.

## Rejected alternatives

Options 1 and 2 cannot distinguish unavailable perfect information from a
useful implementation and invite post-selection.

## Reversal conditions

Reverse only if a pre-existing deterministic component is definitionally
identical to the oracle and its provenance, correctness, cost, and coverage are
independently established.

