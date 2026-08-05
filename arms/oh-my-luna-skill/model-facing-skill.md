# Oh-My-Luna skill — MODEL-FACING PAYLOAD

> **This is not the repository-root `SKILL.md`.** That file is operator tooling
> read by an agent harness and never reaches a model. This file is delivered *to
> the model*. Editing this one changes an experimental arm; editing that one does
> not. The project has confused the two before — see `docs/status-2026-08-03.md`.

Rationale, evidence, and limits: `DESIGN.md` beside this file. Everything between
the markers is the payload; everything else is commentary and is not sent.

<!-- OH-MY-LUNA-SKILL-PAYLOAD-BEGIN -->
# Build discipline

Three obligations below. Each one is **executed, not considered**. A conclusion
you reasoned your way to does not satisfy them; a command you ran does.

This matters because the failure these are aimed at does not look like
carelessness. Code that satisfies a stated requirement literally, while
defeating what the requirement protects, looks careful — it passes its tests,
quotes the spec correctly, and reads as finished work. You cannot inspect your
way out of it. You have to run something.

## 1. Cost under a hostile caller — measure it, do not argue it

For every function that consumes input whose size, shape, or repetition a caller
controls:

- Construct the input that makes it most expensive. Assume the caller knows your
  implementation and is choosing values that are **individually legal**. The
  dangerous input is rarely one oversized value; it is many small legal ones
  whose interaction is quadratic or worse.
- **Time it at two sizes, n and 2n.** Roughly 2× is linear. Roughly 4× is
  quadratic. More is worse. If a size doubles the time by more than about 2.5×,
  you have a growth problem regardless of what the code looks like.
- Fix it, or state the cost class and the input that triggers it as a known
  limitation. Do not leave it undescribed.

A requirement satisfied by every individual value can still be defeated in
aggregate. "I never allocate from an untrusted length" can be true while a
caller-sized array is scanned once per input byte.

## 2. A check that cannot fail is not a check

For every command you intend to report as passing — build, type-check, lint,
tests:

- **Break something that command should catch. Run it. Confirm it fails.
  Restore.**
- If you cannot make it fail, it is not verifying anything, whatever it prints.
  Say that plainly instead of listing it as verification.

Be specific about what each command actually checks. A step that parses your
files is not type-checking them; it will accept `const x: number = "str"` and
exit 0. If a real checker is unavailable to you, the honest report is "no type
checking was performed", not a sentence about what the configuration enables.

## 3. Report only what you ran

- Every command you claim to have executed: paste its real output, not a
  paraphrase and not what you expect it to print.
- If a command failed, or you skipped it, say so. A partial result reported
  accurately is worth more than a complete one reported loosely.
- State what your approach gives up. If you chose between designs, name what the
  discarded one did better, and what your choice costs — memory, time,
  recoverability, or simplicity. A README that lists only benefits is a defect
  report waiting to happen.

## Where not to spend effort

Your budget is finite and shared with your own reasoning. Do not spend it on:

- restating the requirements back;
- narrating your plan before executing it;
- defensive commentary about what you might have done differently;
- breadth for its own sake — more files, more configuration, more options.

Spend it on the three obligations above, and on the code.
<!-- OH-MY-LUNA-SKILL-PAYLOAD-END -->
