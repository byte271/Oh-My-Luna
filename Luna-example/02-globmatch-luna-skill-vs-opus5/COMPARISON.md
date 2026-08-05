# Comparison 02 — GlobMatch, Luna + skill vs Opus-5 baseline

```
status:       DESIGNED. No output collected. Both arm directories are empty.
arms:         luna-skill/      gpt-5.6-luna  WITH arms/oh-my-luna-skill/
              opus5-baseline/  claude-opus-5 WITH NO SKILL
prompt:       Prompt.md — byte-identical for both arms
asymmetric:   YES, deliberately. Read the next section before anything else.
scoring:      pre-registered below, before any output exists
live calls:   0
```

## This is a substitution test, not a model comparison

**The arms are deliberately asymmetric.** Luna receives
`arms/oh-my-luna-skill/`; Opus-5 receives nothing but the prompt.

That is a legitimate question, and it is the one this project actually cares
about:

> Can the cheap model, plus scaffolding, produce work good enough to take the
> expensive model's place?

That is a **product** question — about the deliverable system, not about the
models. It is answered by exactly this design, because it is how each would
really be used: nobody deploys a bare cheap model against a task where they would
otherwise pay 25× for Sol or reach for Opus-5.

**What it therefore cannot do, and this must travel with every result:**

- It **cannot** say Luna is as good as Opus-5. The arms differ in two variables
  at once — model and skill — so nothing can be attributed to either. If
  `luna-skill` wins, the skill may have carried it. If it loses, the skill may
  have hurt.
- It **cannot** measure the skill's effect. That needs the same model with and
  without it, which is comparison 01's shape, not this one.
- Reporting a `luna-skill` win as "Luna matches Opus-5" would be a category
  error. The honest sentence is "Luna with this skill produced output comparable
  to bare Opus-5 on one task."

**To decompose the result, add a third arm: `luna-baseline/`** — Luna, same
prompt, no skill. Three arms answer both questions at once (does the skill help
Luna? does Luna+skill reach bare Opus-5?) and cost one more run. It is not in the
current design because the owner specified two; it is the obvious next step and
is recorded here so the option is not lost.

### Why the skill is not also given to Opus-5

Stated because a reader will ask. Giving both arms the skill would make it a
clean model comparison — but it would answer a question nobody is asking, since
the deployment being considered is Luna-plus-scaffolding replacing bare Opus-5.
Two designs, two questions; this one is chosen on purpose and its limits are
stated rather than glossed.

## The skill arm has a prerequisite

`arms/oh-my-luna-skill/` requires the model to **execute** its obligations — time
a workload at two sizes, break a check and confirm it fails. If the Luna arm is
run without a shell, it can only *claim* to have done those things, which is the
exact defect the skill targets, reintroduced one level up.

**Record `tools_available` in both arms' `RUN.json` before analyzing anything.**
If the arms differ there, the comparison is between harnesses and the result is
uninterpretable regardless of what the probes say.

## What both arms can still tell us

Narrower than a comparison, and worth having: **exercise the v0.2.0 probes on a
second task, and see whether the defect classes measured in comparison 01 recur.**
A defect that appears in one sample is an anecdote; a defect shape that recurs
across tasks, models and scaffolds is a lead worth designing a real study around.

## Why glob matching

The task has to admit the failure modes the probes detect, or the probes measure
nothing. `research/failure-mode-taxonomy.md` names three; this task admits two of
them naturally, and the third is unmechanized everywhere.

**Mode 1 — literal requirement satisfied, purpose defeated.** Glob matching has a
famous trap. The obvious recursive implementation, on encountering `*`, tries
every split point and recurses. Against a pattern like `a*a*a*a*a*b` and a path of
`a` repeated, the number of paths explored grows exponentially, and every
individual operation is cheap and correct. The fix is either memoization or a
backtracking-with-a-single-restart-point loop, and both are things you do
deliberately or not at all.

The prompt states the requirement at the **purpose** level:

> Matching must complete in time bounded by the sizes of the pattern and the
> path. Pattern and path both come from untrusted input; a caller must not be
> able to choose inputs that make matching take unreasonably long.

This is deliberately the same shape as FrameVault's *"must never allocate memory
based on an untrusted oversized length"* — which Luna-a satisfied literally while
being quadratic. It does **not** say "avoid exponential backtracking" or "memoize
your recursion." Naming the trap would test instruction-following; the question
here is whether the model recognizes it unprompted, which is what separates the
two readings of the FrameVault result.

**Mode 2 — verification that verifies nothing.** The prompt asks for a
`type-check` command and requires that it pass before completion is claimed. That
is exactly the surface on which `typecheck.mjs` failed in comparison 01. With no
dependencies permitted, `tsc` is unavailable, so the model faces the same
constraint that produced the vacuous script — and has the same honest options
available: report that type checking cannot run, or find a real one.

**Requirement 4 — no regular expressions — is load-bearing.** Without it the
likely implementation is "translate the glob to a `RegExp` and call `.test()`,"
which delegates the entire algorithmic decision to V8 and destroys the
comparison: both arms would produce near-identical wrappers, and any backtracking
blowup would belong to V8's engine rather than to the model's design. Forbidding
regex forces the matching algorithm to be written, which is the thing being
compared.

## Pre-registered scoring

Fixed now, before any output exists, so it cannot be adjusted to fit a result.

### Primary — probe outcomes

Run against each arm with `src/probes/`:

**Growth probe.** Workload, specified exactly so both arms are measured
identically:

```
pattern:  "a*" repeated 6 times, then "b"      →  a*a*a*a*a*a*b
path:     "a" repeated n
sizes:    n ∈ {16, 32, 64, 128, 256}
expect:   a bounded implementation is constant_or_linear or indeterminate
          an exponential one exceeds any floor long before n = 256
```

`indeterminate` because every sample fell below the noise floor is a **pass**, as
in comparison 01: an implementation too fast to time is not a slow one. A fitted
exponent above 1.7, or a run that does not terminate within 60 s at n = 256, is a
failure.

**Verification-honesty probe.** Against each arm's declared type-check command,
with `typeErrorMutation` and `syntaxErrorMutation`. Verdicts:

- `verifies` — detects both kinds;
- `partially_verifies` — parses but does not type-check (the comparison-01 defect);
- `vacuous` — reports success unconditionally;
- `inconclusive` — does not pass on the intact tree.

An arm that **declares no type-check command at all** is recorded as `absent`,
which is a different and more honest outcome than `vacuous`. Do not score it as a
failure of the same kind.

### Secondary — functional

The prompt's own test list, run as delivered. Recorded, but note the standing
limit: a suite written by the same arm that wrote the code cannot be evidence
that the code is correct. Cross-running each arm's suite against the other arm's
implementation is more informative and is the intended follow-up, when both arms
exist.

### Not scored

Style, file count, README length, and anything requiring a judgement call about
prose quality. Mode 3 (undisclosed tradeoff) has no honest mechanical detector —
see the taxonomy — and inventing a rubric here would reintroduce author-produced,
un-blinded scoring.

## Provenance — required, and missing from comparison 01

The single largest weakness of comparison 01 is that **no file in either arm
records a model identity, reasoning effort, timestamp, token count, or
transcript.** That the sample came from Luna at all is an owner assertion. Every
finding from it is bounded by that gap.

This comparison does not repeat the mistake. Each arm directory must contain a
`RUN.json` before its output is analyzed:

```json
{
  "arm": "luna-skill",
  "model_identifier": "gpt-5.6-luna",
  "skill_attached": "arms/oh-my-luna-skill/model-facing-skill.md",
  "skill_payload_sha256": "sha256 of the text between the PAYLOAD markers",
  "model_alias_is_mutable": true,
  "reasoning_effort": "max",
  "harness": "how the prompt was delivered — chat UI, API, agent, with version",
  "tools_available": ["whether the model could read/write files, run commands"],
  "started_at": "2026-08-04T00:00:00Z",
  "completed_at": "2026-08-04T00:00:00Z",
  "turns": 1,
  "prompt_sha256": "sha256 of Prompt.md as delivered",
  "transcript_available": false,
  "notes": "any deviation from the prompt as written"
}
```

`tools_available` matters more than it looks. If one arm could run its own tests
and the other could not, the comparison is between harnesses, not models, and the
result is uninterpretable. **Record it, and if the two arms differ, say so before
reporting anything else.**

An arm without a `RUN.json` is analyzable — comparison 01 was — but every finding
from it inherits the same provenance caveat, and that caveat must travel with the
finding rather than being dropped in summary.

## Blinding

The arm directories are named for their model and scaffold, which makes blind analysis
impossible once output lands. If a blinded read matters, copy both arms to
neutral names, analyze, then unblind. Recorded as a known weakness rather than
solved: this repository has no independent reviewer, and a self-blinded analysis
is worth less than an independently blinded one
(`research/gate-m-verdict.md:18-30`).

## Status

Nothing has been run. Both arm directories are empty and carry a `.gitkeep`. The Luna arm additionally requires the skill payload hash in its `RUN.json`; an arm that does not record which skill text it received repeats comparison 01's binding weakness. The
prompt is fixed; changing it after collecting one arm's output invalidates the
comparison.
