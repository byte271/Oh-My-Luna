# Luna-Sol capability gap

## Evidence boundary

**Fact:** Official OpenAI documentation positions Luna for clear, repeatable,
high-volume work and Sol for complex, open-ended, high-value work. Luna and Sol
both expose the modern tool surface and a 1.05M context window. At standard
short-context Standard API rates retrieved on 2026-08-02T00:49:04-04:00, Luna costs $0.20/M input and
$1.20/M output; Sol costs $5/M input and $30/M output: a 25x token-price ratio.

**Observation:** A third-party, bash-only SWE-bench Verified run reports 93.0%
for Luna and 96.2% for Sol. Its single-tool harness reduces scaffold variance,
but the retrieved page does not expose exact reasoning effort, token budget,
retry count, or full traces. Treat it as a capability signal, not the project's
baseline.

| Difficulty slice | Tasks | Luna | Sol | Sol-Luna gap | Interpretation |
|---|---:|---:|---:|---:|---|
| <15 minutes | 194 | 96% | 97% | 1 pp | Little room for a heavy runtime |
| 15 minutes-1 hour | 261 | 92% | 95% | 3 pp | Optimize cost and non-regression |
| 1-4 hours | 42 | 86% | 98% | 12 pp | Best public signal for the V0 target |
| >4 hours | 3 | 67% | 100% | 33 pp | Too few samples for a stable claim |
| Overall | 500 | 93.0% | 96.2% | 3.2 pp | Saturated and contamination-prone |

## Working capability matrix

This table is a **design hypothesis matrix**, not a measured Luna diagnosis.
Each row must be promoted or rejected by the profiler and paired task runs.

| Gap class | Candidate failure | External mechanism | Observable outcome | Current confidence |
|---|---|---|---|---|
| Externally compensable | misses relevant symbol/file | token-budgeted symbol/call/test map | correct files inspected before edit | medium; Aider/SWE-agent evidence |
| Externally compensable | edits before reproduction | edit capability locked until reproduce or explicit `not_reproducible` record | lower speculative-edit rate | medium; Debug2Fix analogue |
| Externally compensable | guesses runtime state | high-level debugger/probe capability | root cause supported by captured values/trace | high as a general mechanism, unmeasured on Luna |
| Externally compensable | loses state after compaction/restart | event log plus compact run brief | resumed run preserves requirements and completed evidence | medium; LangGraph/OpenHands/OMX precedent |
| Externally compensable | malformed tool calls | narrow typed capability schema and fixture probe | fewer schema errors and retries | medium |
| Externally compensable | trusts green existing tests | requirement-specific oracle and evidence dependencies | fewer false-completion receipts | medium |
| Externally compensable | unnecessary edits | scoped patch policy plus diff-impact capability | fewer unrelated files/lines changed | medium |
| Partially compensable | converges on first hypothesis | bounded competing-hypothesis record with discriminating probe | more correct root causes at controlled cost | low until Luna probes run |
| Partially compensable | repeats failed action | deterministic failure signature and retry budget | fewer identical failed calls | medium |
| Partially compensable | chooses wrong abstraction | retrieved local precedent, history, and API constraints | hidden-test gain without patch bloat | low |
| Partially compensable | stops with weak verification | claim-to-evidence policy plus explicit uncertainty | fewer unsupported completion claims | medium, but intent coverage remains hard |
| Primarily model-bound | original algorithm design without oracle | optional declared Sol escalation or user review | no Luna-only promise | high |
| Primarily model-bound | ambiguous strategy with no discriminating test | explicit uncertainty and reversible recommendation | honest non-resolution | high |
| Primarily model-bound | aesthetic judgment without stable rubric | visual artifacts plus user rubric; optional stronger model | subjective acceptance | high |

## Profiler probes

Every probe is repeated with a pinned model snapshot, effort, tool surface,
budget, and seed where supported. Report Wilson intervals for binary outcomes
and distributions rather than false decimal precision.

| Trait | Controlled probe | Primary metric | Downstream promotion rule |
|---|---|---|---|
| Retention under irrelevant context | same requirement set with 0/25/50/75% distractor tokens | exact requirement recall and task success | choose smallest capsule policy whose held-out success is non-inferior |
| Requirement omission | issue with 6-10 independently scorable constraints | omitted hard constraints | Task IR gate only if downstream omissions fall |
| Tool argument accuracy | typed tools with near-neighbor fields and injected recoverable errors | valid-call rate, semantic argument accuracy | expose schema shape only if held-out task success improves |
| Tool failure interpretation | timeout, exit code, partial output, permission denial, and test failure fixtures | correct failure class and next action | select preferred error envelope |
| Modify-before-reproduce | reproducible and non-reproducible bug pairs | edits before first valid reproduction decision | enable edit gate only for task classes with net success gain |
| Failed-action loop | deterministic repeated failure fingerprint | maximum identical retries and wasted tokens | set retry budget from empirical optimum |
| Unnecessary edits | task solvable in one file with tempting nearby refactor | unrelated files and semantic diff size | enable scope policy if hidden success is preserved |
| False completion | visible tests pass while hidden requirement fails | unsupported `completed` claims | evidence gate is core only if false claims fall without timeout regression |
| Structured vs text observations | identical facts in prose and typed JSON | correct next decision, tokens, latency | store result-shape choice by Luna snapshot |
| Capsule size | ranked evidence capsules at several token budgets | success/cost Pareto frontier | profile stores a range, never a universal magic number |
| Context reset recovery | restart from event-derived brief versus raw transcript summary | preserved constraints and success | adopt brief schema only after held-out gain |
| Visual verification | UI task with DOM-only false positive and screenshot defect | artifact inspected, defect detected | visual gate only for UI-labeled tasks |

## Required first-party measurements

The original broad-arm plan is superseded by `../docs/evaluation-plan-v3.md`.
Gate M first validates the method without a capability claim. Gate H then uses
frozen representative and high-gap slices to estimate oracle headroom. Gate A
separately tests the smallest practical approximation; it cannot be selected
from oracle success alone. A 12–20-task pilot remains exploratory, and release
claims require a larger pre-registered sample sized at the task level.

Until those runs exist, the claim is only: **there is credible prior evidence
that better interfaces can close some model gaps, and a large current price
ratio makes the experiment economically worthwhile.**
