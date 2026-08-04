# Skill-control candidate — model-facing prompt text

**Status:** candidate, not frozen. Not part of `gate-h-heldout-v1`.
**Protocol version this belongs to:** `gate-h-heldout-v2` (not yet frozen).

This file is the **model-facing** "lean fixed Skill" control arm required by
`docs/evaluation-plan-v3.md:22`. Its contents are delivered to `gpt-5.6-luna` as
`instructions` on the Responses API, exactly the way the frozen system prompt is
(`scripts/gate-h-heldout/run-stage-a.mjs:249`).

It is **not** `SKILL.md` at the repository root. That file is operator tooling for
an agent harness and never reaches the model. Confusing the two would mean
reporting an operator-documentation edit as an experimental result.

## What this arm is for

Gate H asks whether *correct information* helps Luna (T1–T3 supply progressively
more). The skill-control arm asks a different and cheaper question:

> Does **generic, task-independent** repair guidance — the kind a fixed skill file
> could plausibly contain — account for any of the effect that T1–T3 produce?

Without it, a T1 gain is ambiguous: it could come from the specific context
supplied, or merely from being told to work carefully and systematically. This arm
is what makes the distinction measurable.

## Design constraint — why this text is boring

The arm is only a valid control if it contains **nothing task-specific**. It must
carry:

- no file paths, symbol names, or line numbers;
- no observations, reproductions, or error text;
- no diagnosis, root cause, or behavioral objective;
- nothing derived from any of the five corpus tasks or their corrected commits.

Every mechanism in `research/luna-sol-gap.md:30-45` is rated `medium` or `low`
confidence and **unmeasured on Luna**. Encoding those hypotheses here would make
this a speculative treatment wearing a control's label. The temptation to write
something more ambitious is exactly what this constraint exists to resist.

The text below must be derivable from general software-repair practice alone,
with the corpus unseen.

## Leakage check before freezing

This candidate must clear the same mechanical gate as every arm packet:

```sh
node scripts/gate-h-heldout/check-leakage.mjs
```

The existing exclusion threshold is 0.5 similarity against known repairs; the
current maximum across 20 packets is 0.177 (`research/gate-h-heldout/STATUS.md:66`).
Because this text is task-independent by construction, its similarity should be
near zero. **A non-trivial score means task content leaked in and the arm is
invalid** — fix the text, do not adjust the threshold.

---

## CANDIDATE TEXT BEGINS

The text between the markers is the entire payload. Everything above and below is
commentary and is not sent.

<!-- SKILL-CONTROL-PAYLOAD-BEGIN -->
You are fixing a defect in an existing software repository.

Work in this order:

1. Read the reported behaviour carefully and restate, to yourself, the exact
   observable difference between what happens and what should happen.
2. Locate the code responsible for that observable behaviour before changing
   anything. Prefer reading to guessing.
3. Identify the smallest change that corrects the reported behaviour.
4. Check your change against the reported behaviour once more before answering.

Constraints:

- Make the smallest change that corrects the reported behaviour.
- Do not modify tests.
- Do not modify unrelated files.
- Do not restructure, rename, or reformat code that is not part of the defect.
- Prefer a fix at the point where the incorrect value or behaviour originates
  over compensating for it at the point where it is observed.
- If the reported behaviour has more than one plausible cause, choose the one
  supported by the code you can actually read, not the one that is most familiar.

Reply with a single JSON object and nothing else:
{"files":[{"path":"<repository-relative path>","contents":"<complete new file contents>"}]}

Every file you list is written verbatim, so each "contents" must be the entire
final file, not a fragment or a diff.
<!-- SKILL-CONTROL-PAYLOAD-END -->

## CANDIDATE TEXT ENDS

---

## Relationship to the frozen system prompt

The frozen `gate-h-heldout-v1` system prompt (`identity.json:203`) already
contains the smallest-change instruction, the no-tests rule, the no-unrelated-files
rule, and the JSON output contract. This candidate **is a superset**: same output
contract and constraints, plus generic procedural guidance and two additional
generic constraints (fix at origin; prefer readable evidence over familiarity).

That overlap is deliberate and necessary. The arms must differ in exactly one
dimension — presence of generic procedural guidance — or the comparison is
confounded. **The JSON contract must be byte-identical across arms**, since a
parsing difference would show up as a capability difference.

## Before this can be used

1. Decide whether it belongs in the ladder at all. It adds a 5th arm, taking
   Stage A from 20 to 25 attempts (~$0.66 forecast, still inside the $1.59 cap).
2. Bump `protocol_version` to `gate-h-heldout-v2` and re-freeze. It cannot be
   added to `v1` — the freeze binds the arm set, and mutation aborts with exit 30.
3. Run `check-leakage.mjs` and record the score.
4. Re-run all four dry-run stubs and confirm 20/20 → 25/25 behaviour is unchanged
   for the existing arms.
5. Record `skill_sha256` in the freeze. The schema already has the field
   (`schemas/gate-m-study-freeze.schema.json:15`); `v1` sets it to `null` because
   no skill arm existed.

**Do not add this arm after seeing Stage A results.** Adding an arm post-hoc
converts the experiment into a search (`RUNBOOK.md:146-150`). Either freeze it in
before the first live call, or run `v1` as frozen and treat this as `v2` work.
