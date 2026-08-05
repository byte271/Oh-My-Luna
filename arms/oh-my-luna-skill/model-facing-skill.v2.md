# Oh-My-Luna skill v2 — MODEL-FACING PAYLOAD

> Not the repository-root `SKILL.md`. See `../README.md`.
> v1 is `model-facing-skill.md` and is **frozen** — it is the text that produced
> the `luna-skill` arm of comparison 02, and editing it would break that record.

Rationale for every change: `DESIGN.md`, section "What v2 changes and why".

**The one change that matters:** v1's obligations left **no artifact**. Grepping
the arm that received v1 finds zero trace of any of the three — no worst-case
analysis, no falsification, no statement of what was given up. So it is not known
whether v1 fired at all, and a skill whose execution cannot be checked commits
the exact defect it exists to prevent. v2 requires each obligation to leave a
named, mechanically checkable artifact.

<!-- OH-MY-LUNA-SKILL-V2-PAYLOAD-BEGIN -->
# Build discipline

Three obligations. Each is **executed, not considered**, and each **leaves an
artifact**. A conclusion you reasoned your way to does not satisfy them; a
command you ran and recorded does.

This matters because the failure they target does not look like carelessness.
Code that satisfies a stated requirement literally while defeating what the
requirement protects looks careful — it passes its tests, quotes the spec
correctly, and reads as finished work. You cannot inspect your way out of it.

Write your evidence to **`VERIFICATION.md`** in the project root, with exactly
the three headings below. Absent or empty sections count as not done. Keep it
short — measurements and short quotations, not essays.

## 1. `## Worst case` — measure the cost, do not argue it

For every function consuming input whose size, shape, or repetition a caller
controls:

- Construct the input that makes it most expensive, assuming the caller knows
  your implementation and is choosing values that are **individually legal**. The
  dangerous input is rarely one oversized value; it is many small legal ones whose
  interaction is quadratic or worse.
- **Time it at two sizes, n and 2n. Paste both numbers.** Roughly 2x is linear.
  Roughly 4x is quadratic. Above about 2.5x you have a growth problem regardless
  of how the code reads.
- Fix it, or record the cost class and the triggering input as a known limit.

A requirement satisfied by every individual value can still be defeated in
aggregate. "I never allocate from an untrusted length" can be true while a
caller-sized array is rescanned once per input byte.

## 2. `## Falsification` — a check that cannot fail is not a check

For every command you will report as passing — build, type-check, lint, tests:

- **Break something that command should catch. Run it. Paste the failing
  output. Restore.**
- If you cannot make it fail, it verifies nothing, whatever it prints. Record
  that instead of listing it as verification.

Be exact about what each command checks. A step that *parses* your files is not
type-checking them: it accepts `const x: number = "str"` and exits 0. If your
type-check falls back to parsing when a compiler is unavailable, **that fallback
is not a type-check** — say so, and do not let it decide whether you are done.

If a required tool is unavailable, say which one and what you did instead. Do not
infer its verdict.

## 3. `## Limitations` — what you gave up

- If you chose between approaches, name what the discarded one did better.
- Name what your choice costs: memory, time, recoverability, simplicity,
  portability.
- Name what you did **not** verify, and why.

A README listing only benefits is a defect report waiting to happen.

## Reporting

Every command you claim to have run: paste its real output, not a paraphrase and
not what you expect it to print. If a command failed or you skipped it, say so. A
partial result reported accurately is worth more than a complete one reported
loosely.
<!-- OH-MY-LUNA-SKILL-V2-PAYLOAD-END -->
