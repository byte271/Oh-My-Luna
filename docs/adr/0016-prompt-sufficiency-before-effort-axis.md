# ADR 0016: Prompt sufficiency precedes the reasoning-effort axis

## Context

The project owner directed that the objective is making `gpt-5.6-luna` smarter,
citing a benchmark in which Luna at `max` reasoning effort is comparable to
`gpt-5.6-sol` at `medium`, and asked that reasoning effort be pursued as the
mechanism.

Two facts constrain that direction.

First, the effort-parity claim is uncorroborated here. It is recorded as an
owner assertion, with its missing provenance enumerated, in
`data/provider-evidence/effort-parity-2026-08-03.json`. The repository has
precedent for the risk: a previously documented 5:1 Luna–Sol price ratio was
falsified on inspection and is actually 25:1.

Second, `gate-h-heldout-v1` cannot measure any effect of any variable. Its Stage
A prompt omits the source the model is required to reproduce while the transport
runs with `tools: []`, so every arm fails for a harness reason
(`research/gate-h-heldout/DEFECT-2026-08-03-unseen-source.md`). Reasoning effort
cannot be evaluated on an instrument that returns a constant.

## Options

1. Raise reasoning effort on the existing frozen protocol and measure.
2. Cross reasoning effort with the T0–T3 arm ladder in one re-frozen study.
3. Fix prompt sufficiency first, then run effort as a separate single-factor
   study on T0 only.
4. Treat the effort-parity claim as established and tune toward it.

## Evidence

`max_output_tokens` bounds reasoning tokens together with visible output tokens,
so raising effort against `v1`'s 8192 cap produces responses that terminate
before emitting a file. Option 1 would therefore measure a floor and license the
conclusion that effort does not help — an artifact of the cap.

Option 2 puts 80 cells on 5 tasks, confounds the arm contrast with an effort
effect, and exceeds what the frozen continuation rule can adjudicate.
`docs/kill-criteria-v3.md` already refuses capability claims from 12–20-task
pilots.

The transport records `reasoning_tokens` per response (`run-stage-a.mjs:284`), so
two calibration calls convert the cost of an effort sweep from an assumption into
a measurement. This matters because `v1`'s existing forecast assumed 18,000 input
tokens against an actual ~400 — wrong by roughly 45× — which is itself evidence
that assumed token counts in this repository have not been reliable.

Effort is not free. It spends reasoning tokens billed at the output rate, so
capability parity with Sol would not imply cost parity. Cost per success, not
success, is the decision variable, and no document in the repository previously
measured or framed it.

## Decision

Adopt option 3.

Prompt sufficiency is repaired first, in `gate-h-heldout-v2`: full contents of
every permitted path at the base commit, in all arms including T0. A sufficiency
class of pre-flight check is added alongside the existing integrity checks, on the
principle that **a stub must not be more informed than the model it stands in
for**.

Reasoning effort then runs as a single-factor study on T0 only — 5 tasks × 4
effort levels — reporting success, reasoning tokens, and cost per success. It does
not touch the arm ladder. Cost is set from two calibration calls, not assumed.

The effort-parity claim is treated as a hypothesis motivating the study, never as
a premise, and the study is not capable of confirming it: there is no matched Sol
arm.

## Consequences

The owner's stated mechanism is retained but demoted in sequence. Work that costs
nothing and unblocks everything comes first; the credential is deliberately not on
the critical path, because supplying one now would only make a defective run
possible.

The effort study can return a decision-relevant negative cheaply: if success is
flat across effort on five tasks, the premise is weakened at a cost of pennies.

T1's meaning narrows. With source in every arm, T1 measures the value of pointing
at the right region rather than of possessing the file. This is stated in the
freeze rather than left for a reader to infer the broader prior claim.

## Rejected alternatives

Option 1 measures the output cap and misattributes the result to the model.
Option 2 is a garden of forking paths at this corpus size. Option 4 inverts the
repository's stated method by treating an unverified external claim as a
foundation, and the falsified pricing premise is the standing counterexample.

## Reversal conditions

Reverse the sequencing only if `check-prompt-completeness.mjs` exits 0 against a
provisioned corpus, which would falsify the defect and remove the prerequisite.

Abandon the effort axis if calibration shows that reasoning tokens at `max` push
per-attempt cost above the point where Luna's price advantage over Sol survives,
since the axis would then be uninteresting even if it worked.
