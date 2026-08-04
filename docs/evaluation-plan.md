# Evaluation plan

> Superseded by the causal-intervention evaluation plan. Retained to preserve
> the original preregistration history.

## Primary question

Can a small external mechanism convert a repeated Luna failure caused by
missing runtime observation or poor context selection into a correct,
evidence-backed patch at materially lower total cost than Sol?

## First vertical experiment

Use real Python and TypeScript repositories with defects where visible logs are
ambiguous but one bounded runtime observation discriminates the correct root
cause. Candidate classes include:

- mutation/aliasing bug visible only at a specific call boundary;
- async cancellation or retry state bug;
- platform/compatibility allowlist inconsistency;
- parser/security defect requiring a malicious negative input;
- CI failure whose displayed top-level error masks the failing subprocess.

Each task package contains a base commit, issue, environment definition, setup,
visible tests, hidden verifier, oracle patch stored outside agent access, and
classification metadata. Development and held-out repositories are disjoint.

## Arms

1. native Luna with a minimal issue-to-patch harness;
2. Luna plus one lean fixed skill;
3. Luna plus Task IR/context capsules/fixed evidence policy;
4. Luna plus composition-only high-level probe (full V0);
5. full V0 with generated instruments enabled experimentally;
6. Oh My Codex where a technically comparable non-interactive run can be pinned;
7. Sol with the same minimal harness and budgets appropriate to the baseline.

Oh My Codex is excluded rather than approximated if its required runtime cannot
be made identical enough; the exclusion and reason are reported.

## Controls

- exact model snapshot, reasoning effort, response API parameters;
- prompt and tool descriptions;
- repo commit and dirty-state policy;
- container image digest and platform;
- timeout, maximum turns/calls/tokens, retry policy;
- network/filesystem/process permissions;
- cache mode and prior-response reuse;
- task order randomization and repeated trials;
- no agent access to hidden tests, oracle patch, or other-arm traces.

## Metrics

Primary:

- hidden-test task success;
- requested behavior claim success;
- total cost per successful task.

Secondary:

- regression success;
- false completion;
- user corrections;
- unrelated files and semantic diff size;
- reproduce-before-edit rate;
- correct root-cause localization;
- tool schema errors, deterministic retry loops, and recovery rate;
- tokens, cache reads/writes, dollars, wall time, and model/tool calls;
- evidence coverage and stale-evidence attempts;
- instrument count, validation result, and correctness.

## Required ablations

Run full V0 against:

- no profile/default settings;
- raw issue rather than Task IR;
- large raw context rather than capsules;
- no history;
- textual rather than typed capability results;
- no runtime probe;
- no evidence policy;
- fixed template rather than controller;
- single Luna rather than one optional branch;
- composition only versus generated code enabled.

## Statistical plan

- Pre-register tasks, exclusions, primary metrics, and stopping rule.
- Use paired per-task comparisons and bootstrap confidence intervals for success
  deltas and cost per success.
- Report all attempts and per-task outcomes, not only the best run.
- Correct for repeated subsystem comparisons or label them exploratory.
- Analyze development and held-out sets separately.
- Publish task-family slices but avoid claims from tiny cells.

## Reproducibility metadata

Every run records runner/schema version, git commit, model identifier and
snapshot, reasoning parameters, platform/arch, environment digest, task/fixture
digest, tool surface digest, policy digest, budget, timestamps, and sanitized
trace/artifact hashes.

## Current execution status

No live model experiment was possible in the current environment:

- `OPENAI_API_KEY` was absent;
- `codex` was not installed;
- Docker and Podman were absent.

Gate C therefore tests schema, trace, scoring, artifact, and runner mechanics
with a deterministic external-command fixture. It does not report model
performance.
