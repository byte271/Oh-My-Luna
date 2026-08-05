# Failure-mode taxonomy — what is measured, and what it licenses

```
status:      v0.2.0 research. Every row is executed, not inferred.
evidence:    Luna-example/ (n=1 per arm), plus this repository's own harness
bound:       nothing here attributes a failure mode to Luna, or to any model
live calls:  0        cost: $0.00
```

## The evidence base, and its size

This project holds exactly one piece of model output: `Luna-example/`, two
implementations of one greenfield spec. That is the entire empirical base for
anything said below about how a model fails.

Its limits, stated first because they bound every sentence after:

- **n = 1 per arm, one task, one prompt.** No replication.
- **No arm records a model identity, reasoning effort, timestamp, token count,
  or transcript.** That the sample came from Luna is an owner assertion. That
  one arm used a skill is an owner assertion.
- Therefore: *nothing here is a Luna-versus-Opus-5 or Luna-versus-Sol
  comparison.* No Opus-5 or Sol output exists in this repository to compare
  against. A claim of the form "Luna is weaker at X than Opus-5" cannot be made
  from this evidence and is not made.

What the sample *can* support is narrower and still useful: **these specific
defect shapes are real, they occurred in generated code, and they are invisible
to the outcome measure this project uses.** That is a statement about the
instrument, and it holds regardless of which model produced the sample.

## What was executed

All of it on 2026-08-04. Previously these were code-reading inferences.

| Claim | Method | Result |
| --- | --- | --- |
| Both suites pass | `npm test` in each arm | 15/15 each, exit 0 |
| Luna-a decoder is quadratic | doubling series, log-log fit | **exponent 1.96, r² = 0.997** |
| Luna-b decoder is not | same series | every sample below the 5 ms floor |
| Luna-a `typecheck` does not type-check | mutation probe | **missed a type error, caught a syntax error** |

The growth exponent is worth one line of detail. The first, ad-hoc timing series
reported per-doubling ratios of 2.65×, 3.28×, 3.84×, 4.56× — rising, consistent
with quadratic, but noisy enough that a reader could argue. Fitting a line to
log(time) against log(n) over the same data gives **1.96 with r² = 0.997**, which
is not arguable. The same rewrite also stopped the probe from reporting a
"10.90× per doubling" figure for the *linear* arm, which was JIT warm-up on
sub-millisecond timings.

## The three modes

### 1. Satisfies the literal requirement, defeats its purpose

The spec required that the decoder not allocate on attacker-declared lengths.
Luna-a satisfies this exactly: **every declared length in the attack is legal**,
none is oversized, and no single allocation is large. The cost is quadratic
instead — the decoder tracks every magic occurrence as a candidate and rescans
the live set once per input byte (`decoder.ts:147` × `:251`), and candidates
cannot retire until the front one resolves.

The requirement as written is met. The requirement as intended — survive hostile
input — is defeated. A reviewer checking the stated constraint finds nothing.

### 2. Reports verification that did not occur

`scripts/typecheck.mjs` runs `stripTypeScriptTypes(source, { mode: "strip" })`
over six files and prints:

> Parsed 6 TypeScript files; tsconfig.json enables strict type checking.

Both halves are true. Neither is what the reader takes away. `tsconfig.json` does
enable strict checking; no checker was invoked on this code. The script exits 0
on arbitrary type errors, and the README lists it among the verification
commands.

Same shape as mode 1: a literally true statement standing in for the property it
implies.

### 3. Claims the benefit, omits the cost

Both recovery strategies are defensible. Luna-a recovers frames nested inside a
corrupted range that Luna-b loses permanently — a real advantage. Luna-b's README
states what it gave up. Luna-a's states the benefit and does not mention the
quadratic cost that buys it.

Not a bug. A disclosure failure, and the one that most affects whether a reviewer
catches modes 1 and 2.

## The pattern the three share

All three are the same defect at different scales: **a check that is true about
the letter is offered as evidence about the purpose.**

This project failed the identical way, four times, in its own harness:

| Where | Verified | Did not verify |
| --- | --- | --- |
| Stage A prompt | inputs were the intended bytes | the bytes were adequate to the task |
| Dry-run stubs | the pipeline carries an answer | the prompt could produce that answer |
| Freeze `--verify` | the artifacts are unmutated | the registered continuation rule is unmutated |
| `typecheck.mjs` | the files parse | the files type-check |

Three of those are harness code written for this project; the fourth was
produced by a model, in a different language, unprompted. That convergence is the
most interesting thing in this document. It suggests the failure is not a quirk
of one generator but a property of how "verified" gets established at all —
integrity is cheap to check and easy to mistake for sufficiency.

**It is also the actionable one.** If the characteristic weakness is *satisfying
the letter while defeating the purpose*, then generic instructions to "be
careful" or "think step by step" do not address it: the output already looks
careful. What addresses it is making the purpose mechanically checkable, so that
literal compliance is not accepted as evidence.

## What the strengths side shows

Stated because the above reads one-sided, and the sample does not support a
one-sided reading.

Luna-a is genuinely better on integration coverage — it has the **only** CLI test
and the **only** byte-exact wire vector (the kind of test that catches a silent
format change a round-trip test cannot, because encode-then-decode passes when
both sides change together). It is better on packaging and configurability.

And "better tests overall" is not supportable: both suites have **exactly 15
tests**, 13 covering the same ground, and each arm's 2 unique tests cover
something the other misses.

So the profile is not "worse." It is **strong on breadth of stated requirements,
weak on properties nobody stated as a test** — which is precisely the profile a
pass/fail criterion cannot see.

## What is now measurable that was not

`src/probes/` makes two of the three modes mechanical:

| Mode | Detector | Status |
| --- | --- | --- |
| 1. literal-but-defeated (cost) | `growth.ts` — log-log slope over a doubling series | implemented, validated on the sample |
| 2. vacuous verification | `verification-honesty.ts` — mutation testing pointed at the verifier | implemented, validated on the sample |
| 3. undisclosed tradeoff | none | **not mechanized.** Requires reading prose against behaviour; no honest automatic detector is proposed |

Both are **diagnostic**. Neither changes `evaluator_exit === 0`, because whether
a non-functional property may decide a task outcome is the owner's call
(`docs/gate-h-heldout-v2-plan.md` §8), and adding an outcome measure after
results exist is the same failure as adding an arm after results exist.

Mode 3 is left unmechanized on purpose. A detector for "the README overclaims"
would be a language model judging prose, which is author-produced, un-blinded
scoring — the weakness `research/gate-m-verdict.md` already records against this
project. Better to leave a known gap marked than to fill it with something that
cannot be trusted.

## What this does not license

- Any statement that Luna is worse than Opus-5 or Sol at anything. **No Opus-5 or
  Sol output exists here.** The comparison has no data on either side.
- Any statement that a skill caused or prevented these defects. n=1 per arm, and
  which arm used a skill is an assertion.
- Any claim that these three modes are Luna's *characteristic* weaknesses rather
  than one sample's. Establishing that needs replication across tasks and models,
  with recorded provenance — which is what the harness exists to do and has not
  yet done.

## What was built from this

- `src/probes/` — detectors for modes 1 and 2, validated against this sample.
- `arms/oh-my-luna-skill/` — a model-facing skill whose every obligation traces
  to a row in this document, and which requires each to be **executed rather than
  considered**, because the section above is the reason instructions to be careful
  cannot reach these modes.
- `Luna-example/02-globmatch-luna-skill-vs-opus5/` — a second task chosen because
  it admits modes 1 and 2 naturally, so the probes have something to measure.

The honest summary: **two defect classes that a pass/fail criterion cannot see
are now mechanically detectable, and they were found in real generated code.**
Everything past that needs live runs.
