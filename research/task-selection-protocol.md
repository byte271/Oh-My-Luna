# Frozen task-selection protocol

Status: pre-registration specification; no selected capability set  
Selection rule version: `selection/1.0.0`  
Date: 2026-08-02

## Candidate pool

Build the pool before oracle-treatment results exist. For every candidate,
record repository and organization, base and known-fixed commits, source,
family, language, human difficulty estimate, visible tests, hidden-verifier
availability and hash, environment hash and reproducibility, license,
contamination risk, mechanics validation, inclusion state, reason, timestamp,
and selection-rule version. Fixed commits, hidden verifiers, labels, reviewer
notes, and other packets stay outside the model workspace.

Accept a task only when the base fails the intended hidden verifier, the known
fixed version passes, infrastructure is independently valid, the failure is not
just environment breakage, redistribution is permitted, and the agent view
does not expose the oracle. Exclusions remain in the pool with reasons.

## Two disjoint slices

The representative slice is sampled systematically or with a recorded random
seed from eligible tasks without conditioning on treatment outcomes or native
failure. It estimates ordinary workload value and regressions.

The high-gap slice is selected by a predeclared native-Luna failure-rate
threshold, using a pinned snapshot and fixed number of baseline attempts, plus
independent solvability evidence from a known patch, qualified human, or Sol
reference. This estimand is conditional on native failure and is never reported
as average user performance.

The slices are disjoint in one freeze. Results are reported separately. A task
cannot move between slices after treatment outcomes are observed.

## Freeze sequence

1. Construct and hash the candidate pool without oracle-treatment results.
2. Validate base failure, fixed success, hidden verifier, environment, license,
   confidentiality boundaries, and task statement.
3. Run only the pre-registered native baseline needed for high-gap selection.
4. Apply the frozen sampling, stratification, and inclusion rules.
5. Freeze task IDs, slice membership, pool hash, and selection-rule version.
6. Author, review, and freeze treatment-specific packets.
7. Freeze fixtures, prompts, Skill, model snapshot, effort, budgets, scorer,
   environment, packet files, and review files by content hash.
8. Generate a seeded randomized schedule and retain every attempt.

Any mutation creates a new freeze ID. A changed file cannot be silently used
under an old plan. Task is the primary generalization unit; repeated runs only
measure within-task stochasticity. Repository and organization clusters are
reported rather than treated as independent tasks.

