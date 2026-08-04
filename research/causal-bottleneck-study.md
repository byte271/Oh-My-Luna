# Causal Luna bottleneck study

Status: superseded on 2026-08-02 by `intervention-authoring-rubric.md`,
`causal-headroom-vs-approximation.md`, and `../docs/evaluation-plan-v3.md`;
retained as historical context. No live Luna result.
Date: 2026-08-01

## Question

Which missing information, when supplied without revealing a patch, changes
GPT-5.6 Luna's probability of producing a hidden-verifier-passing repair?

## Intervention ladder

Treatments are paired by task and use the exact same Luna snapshot, reasoning
effort, tool permissions, workspace commit, timeout, visible tests, and token
budget. Oracle packets remain outside the agent workspace and are content
hashed in the run receipt.

| Treatment | Information supplied | It must not contain |
|---|---|---|
| `native` | Issue and ordinary workspace only | Oracle data |
| `oracle_context` | Known relevant file/line regions | Diagnosis or patch |
| `oracle_localization` | Correct component and failing boundary | Root cause or fix |
| `oracle_observation` | One decisive execution-grounded fact | Patch text |
| `oracle_diagnosis` | Correct concise root cause plus evidence references | Patch or implementation plan |
| `oracle_plan` | Intended behavioral change and constraints | Code |
| `oracle_verification` | Exact requested behavior still unproven | Hidden test contents |
| `equal_budget` | No semantic assistance | Receives the same total model-spend allowance as assisted arms |

`schemas/intervention-packet.schema.json` defines allowed payloads.
`src/interventions.ts` selects only the requested field and rejects cross-task
packets. `schemas/experiment-plan.schema.json` pre-registers controls and
requires hidden, treatment-blind scoring and reporting of every attempt.

## Failure taxonomy

Each failed trajectory is labeled independently as task misunderstanding,
wrong-file retrieval, wrong-symbol localization, missing runtime observation,
incorrect root-cause reasoning, incorrect patch design, incorrect
implementation, tool-use failure, test interpretation failure, premature
completion, regression introduction, or environment/dependency failure. The
first irreversible failure is recorded separately from later symptoms.

## Pilot design

The minimum informative pilot is 12–20 executable Python/TypeScript tasks from
at least four repositories, sampled to include observed native-Luna failures.
This is engineering validation, not a population estimate. Task order is
randomized once from a recorded seed. At least two repetitions per arm are
needed to expose run variance. The held-out scorer sees a workspace and task ID,
never a treatment label.

Primary outcome: requested-behavior success under hidden verification.
Secondary outcomes: paired success change, cost per success, time to decisive
observation, false completion, unnecessary files, regressions, and fraction of
the Luna–Sol gap closed. Report exact binomial intervals and the paired table;
do not infer dominance from retrieval metrics.

## Decision rule

- Context lift dominates: compare deterministic ranker with a learned reranker.
- Observation lift dominates: build one fixed high-level runtime probe.
- Diagnosis lift exceeds context/localization lift: test a narrow diagnostic
  ranker, with abstention and harmful-guidance measurement.
- Plan/implementation remains poor after correct diagnosis: classify the gap as
  substantially model-bound and evaluate explicit hybrid escalation.
- No arm beats native/equal-budget materially: narrow to reliability or stop.

## Current measured result

None. The local environment has no OpenAI credential or Codex executable, and
no real Luna adapter exists. The deterministic fixture validates mechanics only.
Loc2Repair is supporting prior evidence, not a Luna result: on 500 SWE-bench
Verified tasks, gold modified-file context raised pooled repair from 44.7% to
52.4%, leaving most failures unresolved. This challenges a retrieval-only thesis.
