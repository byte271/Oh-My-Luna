# arms/ — model-facing text

Everything here is delivered **to a model**. Nothing here is operator
documentation.

> The repository root's `SKILL.md` is the opposite: it is read by an agent
> harness and never reaches a model. Editing a file in this directory changes an
> experimental arm and can invalidate a freeze; editing `SKILL.md` cannot change
> any measured result. The project has conflated the two before
> (`docs/status-2026-08-03.md`), which is why they live apart and say so at the
> top of every file.

## What is here

| Arm | Kind | Task shape | Needs a shell | Status |
| --- | --- | --- | --- | --- |
| [`skill-control/`](skill-control/) | **control** | repair | no | candidate |
| [`purpose-check/`](purpose-check/) | treatment | repair | no | candidate |
| [`oh-my-luna-skill/`](oh-my-luna-skill/) | treatment | greenfield build | **yes** | v1 frozen (was run); **v2 candidate** |

None has ever been delivered to a model. `live_calls_made: 0`.

## Control versus treatment — the distinction that must not blur

A **control** is valid only if it contains nothing task-specific and nothing
hypothesis-bearing. `skill-control/` exists so that a gain from supplied context
can be separated from the gain from merely being told to work systematically. Its
blandness is a design constraint, not a shortcoming, and **making it "better"
destroys it.**

A **treatment** deliberately encodes a hypothesis. It is expected to be
opinionated. It must never be merged into the control, and a result from it is a
result about that hypothesis, not about scaffolding in general.

## The shell requirement is not a footnote

`oh-my-luna-skill/` asks the model to *execute* its obligations — time a workload
at two sizes, break a check and confirm it fails. Under `tools: []` in a
single-turn API call none of that is possible, and the model can only **claim** to
have done it. That is the precise failure the skill targets, reintroduced one
level up.

So: `oh-my-luna-skill/` is valid only where commands can be run. Gate H Stage A
sends `tools: []`, so it must not be used there; `purpose-check/` is the
repair-task variant that assumes no shell.

## Before any arm is used

1. **Task-independence.** No file path, symbol name, line number, or content
   derived from a corpus task. Run `scripts/gate-h-heldout/check-leakage.mjs` if
   it is attached to a corpus arm; a non-trivial similarity score means task
   content leaked in and the arm is invalid. Fix the text, never the threshold.
2. **Identical output contract across arms.** A parsing difference surfaces as a
   capability difference.
3. **Decide before freezing.** Adding an arm after seeing results converts the
   experiment into a search.
4. **Record the payload hash** in the freeze.
