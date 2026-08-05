# Oh-My-Luna skill — design rationale

```
status:      candidate. Never delivered to a model. No result of any kind.
kind:        treatment. NOT a control.
payload:     model-facing-skill.md, between the PAYLOAD markers
derived from: research/failure-mode-taxonomy.md — measured, not assumed
```

## The rule this skill was written under

**Every obligation traces to a defect that was measured in real generated code.**
Nothing here comes from prompt-engineering folklore, and nothing was included
because it sounded rigorous.

That rule is what makes the skill short. There are three obligations because
three defect modes were measured. A fourth would need a fourth measurement.

## Why "be careful" was rejected as a design

`arms/skill-control/candidate.md` already contains careful, generic procedural
guidance — work in order, read before guessing, smallest change, check your work.
The taxonomy argues that guidance of that shape cannot reach the measured
failures, and the reason is specific:

> the output already looks careful.

The arm that shipped a quadratic denial-of-service also shipped 15 passing tests,
the only CLI integration test across both arms, the only byte-exact wire vector,
a `.gitignore`, configurable limits, and a README that quoted the spec's
requirements back accurately. By every visible signal it was working carefully.
Telling it to be careful adds nothing it was not already doing.

So each obligation here is **executed rather than considered**. That is the whole
design.

| Obligation | Measured defect it targets | Why execution rather than instruction |
| --- | --- | --- |
| 1. Time it at n and 2n | decoder at **exponent 1.96, r² 0.997** | The author's reasoning was *correct* — it genuinely never preallocates from a declared length. Reasoning could not have caught this; two timings would have shown 4×. |
| 2. Break it and confirm it fails | `typecheck` **missed an injected type error**, exit 0 | The script's printed claim was literally true. Only an attempted falsification distinguishes a checker from a parser. |
| 3. Report only what you ran | README claimed the benefit, omitted the quadratic cost | Disclosure is checkable against behaviour; an instruction to "be honest" is not. |

## Specific choices, and what they cost

**"More than about 2.5×" as the threshold.** A crude rule the model can apply
with two timings and no tooling. It is deliberately loose: JIT warm-up on small
inputs produces ratios far above 2 for genuinely linear code — the ad-hoc probe
in comparison 01 printed a 10.90× ratio for the *linear* arm from sub-millisecond
timings. A model applying this rule on tiny inputs will get false positives. The
alternative — teaching it the noise-floor and log-log method from
`src/probes/growth.ts` — costs far more payload than it is worth, and the failure
direction here is safe: a false positive makes it look harder at something fine.

**"Break it, run it, restore it" requires a shell.** In a single-turn API call
with `tools: []`, obligation 2 cannot be performed and the model can only claim to
have performed it — which is the exact failure being targeted, reintroduced one
level up. **This skill is only valid for arms where the model can execute
commands.** Comparison 02's prompt grants that ("Do not merely describe the
project. Create all files and run the tests"); Gate H's Stage A does not, and this
skill must not be used there. `arms/purpose-check/candidate.md` is the repair-task
variant that does not assume a shell.

**The "where not to spend effort" section is a real bet, and it could be wrong.**
It tells the model to stop doing things — restating requirements, narrating
plans, breadth for its own sake — on the reasoning that `max_output_tokens` bounds
reasoning and answer together, so budget spent on commentary is budget not spent
on code. But comparison 01's skill arm was *better* on breadth (CLI test, wire
vector, packaging, configurability), and suppressing that could cost more than the
three obligations gain. **If this skill reduces functional success, this section
is the first suspect.**

## What would falsify this skill

Pre-registered, so a result cannot be reinterpreted afterwards.

- **Falsified** if attempts under it show no reduction in probe-detected defects —
  `growth.ts` classification and `verification-honesty.ts` verdict — relative to
  the same model without it.
- **Falsified differently, and more importantly**, if functional success drops.
  Three obligations consume output budget and attention. Trading working code for
  better commentary is a loss, and reporting only the probe outcomes would hide it.
  **Report both, or neither.**
- **Not confirmed** by the model *producing* the disclosures. The disclosure has
  to be correct, checked by the probes, not merely present. A model that writes
  "cost is linear" about a quadratic function has satisfied the letter of
  obligation 1 and defeated its purpose — the exact failure this targets,
  reproduced inside its own countermeasure.

That last risk is real and is not solved here. It is the reason obligation 1 says
*time it*, not *state the cost class*: a number produced by a stopwatch is harder
to fabricate than an adjective.

## What v2 changes and why

v1 is frozen — it is the text that produced comparison 02's `luna-skill` arm.
v2 is `model-facing-skill.v2.md`.

**The line I will not cross:** comparison 02 is n=1 per arm, and editing a skill
to fit a single result is the same failure as adding an arm after seeing results.
So v2 changes nothing *because the skill arm scored a certain way*. Every change
below fixes a defect in the skill that is visible without any run.

### 1. Every obligation must leave an artifact — the defect that matters

Grep the arm that received v1 for evidence that any obligation fired:

```
worst case / adversarial / cost class    skill=0 hits   baseline=1
break / inject / confirm it fails        skill=0 hits   baseline=0
gave up / limitation / tradeoff          skill=0 hits   baseline=1
```

**Zero traces, all three.** So it is not known whether v1 was followed, whether
it was delivered, or whether it did nothing — and those are indistinguishable in
the result. A null effect from v1 is uninterpretable by construction.

That is this project's recurring defect, committed by the skill: v1 asked for
three things and produced no way to check that any happened. *A check that cannot
fail is not a check*, one level up. This would be worth fixing if comparison 02
had never run.

v2 requires a `VERIFICATION.md` with three named sections, and
`src/probes/skill-compliance.ts` reads it. "Did the skill fire?" becomes a
measurement instead of an assumption.

**Compliance is not quality, and the probe says so in its own output.** Two
fabricated timings satisfy it and fail `growth.ts`. Reporting compliance alone
would be a true statement about the letter offered as evidence about the purpose
— the thing this whole taxonomy is about.

### 2. "Where not to spend effort" is removed

The only section not traced to a measured defect: a bet that output budget spent
on commentary is budget not spent on code. This file already named it in advance
as the first suspect if the skill reduced quality.

Two facts, neither of which proves it backfired, both of which remove its
justification:

- it was **speculative to begin with**, unlike the three obligations;
- the arm that received v1 wrote fewer tests than the arm that did not (12 vs 18)
  and shipped no limitations section, which is at least consistent with
  suppression.

The honest statement is that its benefit was never demonstrated and its cost is
plausible. A section carrying that balance does not belong in a skill whose
design rule is "every rule traces to a measured defect".

### 3. Obligation 3 is given somewhere to go

v1 told the model to state what it gave up, while the task's output was a
codebase. `purpose-check/candidate.md` records exactly this tension for the
repair setting and I did not carry the lesson across. v2 names the file and the
heading, so the obligation has a destination and a checkable form.

### What v2 still cannot fix

Nothing here addresses the reason comparison 02 cannot answer whether the skill
helps: **n=1 per arm, and `tools_available` unrecorded.** v2 makes a future
result interpretable; it does not make the existing one so. Repetitions at fixed,
recorded settings are the prerequisite, and no amount of skill editing substitutes
for them.

## What it cannot show

No Opus-5 or Sol output exists in this repository. This skill cannot demonstrate
parity with either, and comparison 02 cannot either — see that comparison's own
statement of what an asymmetric design can and cannot support.

## Status

- Never delivered to a model. **Zero runs, zero results.**
- Not leakage-checked against a corpus, because it is task-independent by
  construction — no file path, symbol, or task content appears in the payload.
  Verify before use if it is ever attached to a corpus arm.
- Not frozen into any protocol. Adding it to a frozen one aborts with exit 30.
