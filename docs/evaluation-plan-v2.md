# Evaluation plan V2

Status: superseded on 2026-08-02 by `evaluation-plan-v3.md`. Retained as a
historical decision record; do not use it to run a new experiment.

## Pre-registered comparisons

1. Native Luna with the minimal kernel.
2. Luna plus one lean fixed Skill.
3. Luna plus deterministic repository map/ranker.
4. Oracle context, localization, observation, diagnosis, plan, and verification
   treatments.
5. Equal-total-cost native Luna.
6. The smallest specialist selected by oracle results, if any.
7. Sol with the same minimal kernel.
8. Explicit hybrid Luna/Sol, reported separately.

No learned arm is run before oracle and deterministic arms. Oh My Codex is an
optional comparison only if its exact permissions and budget can be matched.

## Controls

Pin model snapshot, effort, repository commit, environment image, task text,
visible tests, tool permissions, timeout, retry count, token budget, cache mode,
and task order. Store prompt/Skill hashes and per-request usage/billing records.
Use repository-disjoint held-out tasks; report organization-disjoint results
where possible. Scoring is hidden and treatment-blind.

## Outcomes

Primary: requested-behavior and hidden-test task success. Economic: total system
cost per success and wall time, including specialist inference, indexing,
storage, tool charges, and retries. Diagnostic: localization recall, first-edit
correctness, unnecessary files, tool validity, time to decisive observation,
false completion, regression rate, harmful guidance, calibration, and
abstention quality.

Report paired task outcomes, absolute percentage points, fraction of the
observed Luna–Sol gap closed, exact confidence intervals, and every attempt.
Separate development from held-out and retrieval failures from reasoning-after-
retrieval failures.

## Pilot versus claim

A 12–20 task multi-repository pilot validates engineering and detects gross
effects. It cannot support a product claim. A release claim requires a
pre-registered held-out sample sized from observed baseline variance and the
minimum economically meaningful effect, plus full sanitized traces.

## Current blockers

No live GPT-5.6 adapter or credential is available; no security sandbox is
attested; no validated executable task set exists. Therefore this branch
contains no Luna, Sol, oracle, cost, or capability result.
