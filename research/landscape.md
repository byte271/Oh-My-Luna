# Research landscape

Status labels used below:

- **Fact**: directly documented by a primary or official source.
- **Observation**: source-backed result whose scope is narrower than this project.
- **Inference**: conclusion drawn from multiple observations.
- **Hypothesis**: requires Oh-My-Luna evaluation.
- **Unknown**: the required evidence was not available.

## Executive falsification result

**Inference:** The broad seven-component candidate is not justified for V0. The
smallest architecture still supported by evidence is:

1. a versioned Luna run profile containing only experimentally selected knobs;
2. a task compiler that produces a typed issue contract and small context
   capsules;
3. a registry of deterministic primitives and tested high-level capabilities;
4. a declarative composer for task-specific probes;
5. a content-addressed evidence ledger and completion policy;
6. a minimal controller that chooses among a few tested paths.

Generated source-code tools, workflow search, permanent multi-agent teams, and
development-time distillation remain experiments, not runtime foundations.

## Strongest supporting evidence

**Observation:** In a public bash-only SWE-bench Verified run updated
2026-07-31, Luna scored 93.0% and Sol 96.2%. The overall gap is only 3.2 points,
but it widens from one point on tasks estimated below 15 minutes to twelve
points on the 42 tasks estimated at 1-4 hours. This suggests that the useful
target is not generic coding competence; it is long-horizon failure modes on a
selected slice. The source did not expose enough run settings or traces to make
causal claims.

**Observation:** SkillsBench reports +16.2 percentage points from curated skills
over 7,308 trajectories, but only +4.5 points in software engineering, with 16
of 84 tasks regressing. Self-generated skills produced no average gain. Focused
skills with two or three modules beat comprehensive documentation.

**Observation:** Debug2Fix shows that a specialized, high-level runtime
observation interface can improve bug fixing. On GitBug-Java, forcing a debug
subagent before editing improved GPT-5 from 60.2% to 73.1% (21.8% relative).
Giving low-level debug tools directly was flat or harmful and reduced Claude
Sonnet 4.5 from 75.7% to 64.5%. On the Python SWE-bench Live subset, natural
tool adoption varied sharply and gains tracked call rate.

**Observation:** SWE-agent established that model-facing computer interfaces
affect coding performance. Aider independently demonstrates a token-budgeted
symbol graph. OpenAI's current GPT-5.6 guidance says leaner prompts and smaller
task-relevant tool surfaces can improve both scores and cost, and recommends
programmatic tool calling for bounded reduction rather than judgment-heavy
steps.

Together these results support *capability shaping*, not arbitrary autonomous
tool generation.

## Strongest disconfirming evidence

**Observation:** The current public Luna score is already close to Sol on an
aggregate saturated benchmark. A project-wide requirement of +10 absolute
points on all repository tasks is therefore incoherent. The threshold must be
applied to a pre-registered high-gap slice or to failure-mode probes, while the
aggregate target should be cost-adjusted non-inferiority or a smaller absolute
gain.

**Observation:** Self-authored skills did not help on average in SkillsBench.
LATM's economical result depended on a stronger GPT-4 tool maker, which violates
Luna-only runtime independence if copied directly. ToolMaker still failed 20%
of fifteen specialized tool-building tasks and requires installation of
untrusted dependencies. ADAS explicitly warns that it executes untrusted
model-generated code.

**Observation:** Mini-SWE-agent shows that a very small loop can be competitive.
Oh My Codex 0.20.3 contains a mature but very large collection of workflows,
roles, hooks, MCP tools, durable state, and team machinery; its public material
does not provide Luna-specific ablations that attribute quality gains to that
surface. Copying its size would add confounders rather than evidence.

**Observation:** Sequential test-time scaling can reach an effective context
ceiling and degrade. More branches or agents are not automatically better.

## What the major terms mean here

| Term | Precise meaning | Not implied |
|---|---|---|
| Task compiler | Pure function from issue, repo fingerprint, policy, and run profile to a versioned Task IR | Deep semantic understanding or correctness |
| Context compiler | Deterministic and model-assisted selection that emits typed, source-addressed capsules under a token budget | That omitted context is irrelevant |
| Capability | Versioned function with typed input/output, declared effects, permissions, tests, and provenance | A prompt role |
| Instrument | Per-run composition of capabilities used to answer one explicit observation question | Arbitrary autonomous program |
| Evidence ledger | Append-only, hash-linked records of observations and their validity dependencies | Proof of user intent by itself |
| Controller | A small policy selecting an execution template and optional probes | General self-evolving intelligence |
| Profiler | Repeated probe suite that recommends only settings whose downstream effect passes a controlled test | Psychological description of a model |

## Scientific boundary

The following remain **unknown** because this environment had no OpenAI API
credential and no runnable Codex client:

- native Luna trace-level failure frequencies;
- the same-task Sol delta under identical prompts and budgets;
- whether a context capsule or debug probe converts a Luna failure to success;
- profiler stability across repeated Luna runs;
- end-to-end dollar cost after retries, caching, and tool execution.

No benchmark result is fabricated to fill this gap. The evaluation skeleton is
designed to collect it later.

