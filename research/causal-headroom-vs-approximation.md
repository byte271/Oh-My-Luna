# Causal headroom is not approximation feasibility

Status: pre-registered methodological distinction; no model result  
Date: 2026-08-02

## Two questions

Gate H asks whether a bounded category of correct information causally changes
Luna's hidden-verifier success. It compares native and budget controls with
reviewed oracle packets. An oracle is an upper bound, not a product component.

Gate A asks whether a practical mechanism can approximate the useful oracle
closely enough to improve end-to-end repair. It compares the strongest
deterministic and training-free baselines, and only then a learned component if
the preceding baselines leave economically meaningful headroom.

| Result | Permitted conclusion | Forbidden conclusion |
|---|---|---|
| Gate H positive | Perfect information in this category has causal value under the tested protocol | Oh-My-Luna can produce that information |
| Gate H negative | Do not build an approximation for that category under the tested scope | The category is universally useless |
| Gate A positive | The tested component adds held-out end-to-end value relative to the strongest practical baseline | The component generalizes beyond the frozen population |
| Gate A negative | The category matters, but this approximation is not justified | The oracle result was false |

## Gate H controls

Use native Luna, lean fixed Skill, equal-token Luna, equal-cost Luna, the
pre-registered cumulative oracle ladder, selected independent diagnostic arms,
and Sol as a reference. Equal-token and equal-cost are separate because cache,
tool, and output charges can make them diverge. No heuristic or learned system
stands in for an oracle.

## Gate A controls

Freeze a new plan after Gate H. Compare the smallest plausible deterministic
baseline, a training-free structured baseline if distinct, a learned component
only if justified, the relevant oracle upper bound, equal-token and equal-cost
Luna, and Sol. Match Luna calls and permissions where appropriate and report
all-system cost. Oracle-to-component fidelity metrics are diagnostic; hidden
repair success remains primary.

## Decision boundary

The project may validly conclude: “Correct diagnosis improves Luna, but no
practical diagnosis producer currently beats equal-cost Luna.” That result
rejects implementation while preserving the causal finding. Selecting a
component directly from an oracle result is prohibited.

