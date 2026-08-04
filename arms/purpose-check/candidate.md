# Purpose-check candidate — model-facing prompt text (TREATMENT, not a control)

```
status:      candidate. Not frozen, not in any protocol, never run against a model.
kind:        treatment arm. NOT a control.
belongs to:  a future protocol version. Adding it to a frozen one aborts (exit 30).
derived from: research/failure-mode-taxonomy.md — measured, not assumed
live calls:  0
```

**This is not `arms/skill-control/candidate.md` and must never be merged into
it.** That file is a *control*: it is valid only if it contains nothing but
generic procedural guidance, and its blandness is a design constraint. This file
is a *treatment*: it deliberately encodes a hypothesis. Confusing them would
destroy the only thing that lets a T1 gain be separated from "the model was told
to work carefully."

## Why a separate arm exists at all

The skill-control arm carries generic repair guidance — work in order, read
before guessing, smallest change, check your work. `research/failure-mode-taxonomy.md`
argues that guidance of that shape **cannot** reach the defect class actually
measured in the one model output this project holds, and states the reason:

> the output already looks careful.

Both measured defects were produced by an arm that was, by every visible signal,
working carefully. It shipped 15 passing tests, a CLI integration test, a
byte-exact wire vector, and a README quoting the spec's requirements back
accurately. The defects were:

- a decoder that is quadratic under hostile input while **every declared length
  is legal**, so the spec's literal anti-allocation requirement is satisfied
  (measured: exponent 1.96, r² = 0.997);
- a `typecheck` script that prints a true sentence about `tsconfig.json` and
  invokes no type checker (measured: misses an injected type error, exit 0).

Both satisfy the letter of a stated requirement while defeating its purpose.
Telling that generator to "be careful" adds nothing it was not already doing.

## The hypothesis this arm tests

> Requiring a small number of **specific, checkable disclosures** — rather than
> more care — reduces defects of the letter-satisfied/purpose-defeated class.

The mechanism proposed: a disclosure that is *mechanically checkable* cannot be
satisfied by literal compliance, because the check tests the property rather than
the statement. Asking "what is the worst-case input and its cost class?" has an
answer that is either right or wrong. Asking the model to be careful does not.

This is a hypothesis. **It is untested. No model has been run against it.**

### What would falsify it

Pre-registered, so the result cannot be reinterpreted afterwards:

- **Falsified** if attempts under this arm show no reduction in probe-detected
  defects (`growth.ts` classification, `verification-honesty.ts` verdict) relative
  to the control, on a corpus where such defects occur at a detectable rate.
- **Falsified differently, and worth catching**, if it *reduces functional
  success* — `evaluator_exit === 0` going down. Demanding extra disclosure
  consumes output budget and attention, and could trade repair quality for
  commentary. Report both outcomes or neither.
- **Not confirmed** by the model merely *producing* the disclosures. The
  disclosure has to be correct, checked by the probes, not present.

### What it cannot show

No Opus-5 or Sol arm exists in this repository, so this arm cannot say anything
about parity with either. It compares Luna to Luna.

## Design constraints this text must satisfy

Same leakage rule as every arm — task-independent by construction:

- no file paths, symbol names, or line numbers;
- nothing derived from any corpus task or corrected commit;
- the JSON output contract **byte-identical** to every other arm, since a
  parsing difference would surface as a capability difference.

Verify before any use:

```sh
node scripts/gate-h-heldout/check-leakage.mjs
```

A non-trivial similarity score means task content leaked in and the arm is
invalid. Fix the text; do not adjust the threshold.

---

## CANDIDATE TEXT BEGINS

<!-- PURPOSE-CHECK-PAYLOAD-BEGIN -->
You are fixing a defect in an existing software repository.

Make the smallest change that corrects the reported behaviour. Do not modify
tests. Do not modify unrelated files.

Before you answer, resolve these three questions about your own change. They are
not style advice; each has a right and a wrong answer, and each will be checked.

1. **Worst case, not typical case.** If your change touches code that consumes
   input whose size or shape a caller controls, describe the input that makes
   your change most expensive, and give the cost class under it (constant,
   linear, quadratic, worse). Construct that input adversarially: assume the
   caller is hostile, knows your implementation, and is choosing values that are
   individually legal. A requirement satisfied by every individual value can
   still be defeated in aggregate.

2. **A check that cannot fail is not a check.** For any step you describe as
   verifying, testing, or validating something, name a specific defect that step
   would fail on. If you cannot name one — if the step would report success on
   code containing the very error it appears to guard against — say that plainly
   instead of describing it as verification.

3. **What you gave up.** If you chose between approaches, state what the
   discarded approach did better. If your choice costs something — memory, time,
   recoverability, simplicity — state the cost, not only the benefit.

Answer briefly. One or two sentences each. If a question does not apply to your
change, say so and why, rather than inventing an answer for it.

Reply with a single JSON object and nothing else:
{"files":[{"path":"<repository-relative path>","contents":"<complete new file contents>"}]}

Every file you list is written verbatim, so each "contents" must be the entire
final file, not a fragment or a diff.
<!-- PURPOSE-CHECK-PAYLOAD-END -->

## CANDIDATE TEXT ENDS

---

## An unresolved tension in this design

Stated rather than hidden, because it affects whether the arm is interpretable.

The three questions ask for **prose**, but the output contract permits only a
JSON object of file contents. As written, the model has nowhere to put the
answers, so it will either omit them or smuggle them into code comments. Three
ways out, none free:

1. **Extend the output contract** with an optional `notes` field. Cleanest, but
   the contract is then no longer byte-identical across arms, which is exactly
   the confound the control arm's design note warns about.
2. **Let the disclosures stay internal** — the questions shape reasoning without
   requiring output. Preserves the contract and makes the disclosures
   unobservable, so only the probes can detect an effect, and question 3
   (tradeoff disclosure) becomes untestable entirely.
3. **Route the disclosures into the code as structured comments.** Observable and
   contract-preserving, but it changes the returned file, which the base-vs-
   returned diff will read as extra hunks — polluting the measure built in v0.2.0
   to detect exactly that.

**Option 2 is the least confounded and is what the payload above assumes** — the
text asks the model to *resolve* the questions, not to emit them. Option 1 is
better science if the contract change is applied to every arm simultaneously,
including the control, so the arms still differ in one dimension only.

This is a design decision with real costs either way, and it belongs to whoever
owns the protocol, alongside `docs/gate-h-heldout-v2-plan.md` §5 and §8. It is
recorded here rather than settled.

## Before this can be used

1. Settle the output-contract tension above.
2. Run `check-leakage.mjs`; record the score.
3. Decide whether the ladder gets a 6th arm at all — with the skill control that
   is 30 attempts per Stage A, not 20.
4. Confirm the probes fire at a detectable rate on the corpus. **If the corpus
   contains no task where a quadratic or vacuous-verification defect is
   reachable, this arm cannot be measured on it**, and the honest response is to
   say so rather than to run it and report a null.
5. Freeze into a new protocol version. Never add it after seeing results.
