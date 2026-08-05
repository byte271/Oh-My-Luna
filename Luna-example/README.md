# Luna-example — model output comparisons

This directory holds **model output**, not harness code. Everything else in this
repository is protocol, corpus and instrumentation with `live_calls_made: 0`;
these samples arrived from outside the harness, so nothing the project built
applies to them — no freeze, no leakage check, no evaluator, no receipt, no cost
record.

They are samples. They are not results, and no capability claim may be drawn from
them.

## Comparisons

| # | Compares | Arms | Status |
| --- | --- | --- | --- |
| [01](01-framevault-skill-ab/) | a skill, across one model | `Luna-a` (skill) · `Luna-b` (no skill) | output collected, analyzed |
| [02](02-globmatch-luna-skill-vs-opus5/) | **substitution + decomposition**: 3 arms | `luna-skill` · `luna-baseline` · `opus5-baseline` | output collected, scored |

Each comparison directory holds:

- `Prompt.md` — the exact prompt, byte-identical across that comparison's arms;
- `COMPARISON.md` — what it varies, how it is scored, and what it cannot show;
- one directory per arm;
- any probe or tool specific to that task.

Analysis lives in `research/`, not here, so the samples stay unedited.

## What comparison 01 established

Executed 2026-08-04, previously inferred from code reading:

| | Luna-a (skill) | Luna-b (no skill) |
| --- | --- | --- |
| own test suite | 15/15 pass | 15/15 pass |
| decoder growth | **exponent 1.96, r² 0.997** | below the noise floor at every size |
| `typecheck` | misses an injected type error | no type-check command |
| unique coverage | CLI end-to-end, byte-exact wire vector | truncated-CRC, buffer aliasing |

Full analysis: [`research/luna-example-framevault-ab.md`](../research/luna-example-framevault-ab.md).
Defect taxonomy drawn from it: [`research/failure-mode-taxonomy.md`](../research/failure-mode-taxonomy.md).

**Its binding limit:** no file in either arm records a model identity, reasoning
effort, timestamp, or transcript. That the sample came from Luna is an owner
assertion, and so is which arm used a skill. Every finding above inherits that
caveat.

## What comparison 02 established

Scored 2026-08-04 against scoring registered before the output existed.
[`RESULTS.md`](02-globmatch-luna-skill-vs-opus5/RESULTS.md).

**All three arms pass the growth probe** — the trap the task was built around —
with every sample below the noise floor, against a positive control that blows
past a 10 s budget at n=128. None reproduced the asymptotic defect measured in
comparison 01. All three comply with the no-regex requirement and pass their own
suites.

**They separate on verification honesty.** `luna-baseline` — Luna, same asserted
effort, no skill — ships code that **fails its own type-check**: ~12 `TS7006`
implicit-any errors under the real compiler, while the prompt required the
type-check to pass before claiming completion. The cause is a one-line platform
assumption: its fallback decides the compiler is missing by looking for
`"not recognized"`, which is cmd.exe's wording, so on a POSIX shell the fallback
either misfires or reports a compile failure. `luna-skill` and `opus5-baseline`
both compile clean.

That is mode 2 of the taxonomy, measured, with the skill/no-skill contrast
available for the first time. **It is still n=1 per arm** — one sample cannot
attribute the difference to the skill.

The one dimension that would have separated them rested on **an ambiguity in the
prompt I wrote** — whether `**` inside a segment is a star run or two literal
characters. Both arms resolved it defensibly, self-consistently, and documented
which reading they took. That dimension is unscoreable and neither arm is marked
down for it; the fix is to disambiguate the prompt for any future run, not to
pick a winner now.

**Provenance is partial.** Model and reasoning effort (both Luna arms at `max`,
Opus-5 at `High`) were supplied by the owner *after* the output existed, so they
are recorded as asserted rather than verified. `tools_available` and timestamps
remain unknown — and `tools_available` is the field that decides whether this
compares models or harnesses. Better than comparison 01, which had nothing; short
of a record made before the run.

## Adding a comparison

0. **Say what varies, in the directory name.** Comparison 02 is asymmetric —
   Luna gets a skill, Opus-5 does not — so it is named
   `02-globmatch-luna-skill-vs-opus5`, not `luna-vs-opus5`. A name that hides an
   asymmetry invites the result to be quoted as something it is not.
1. **Write the prompt first, and freeze it.** Byte-identical across arms.
   Changing it after collecting one arm's output invalidates the comparison.
2. **State the scoring before any output exists.** Which probes, which workloads,
   which thresholds. Scoring chosen after seeing results is not scoring.
3. **Require a `RUN.json` per arm** — model identifier, reasoning effort, harness,
   tools available, timestamps, prompt hash, and the payload hash of any skill
   attached. Comparison 01 lacks this and is
   permanently weaker for it. `tools_available` especially: if one arm could run
   its own tests and the other could not, the comparison is between harnesses.
4. **Pick a task the probes can actually score**, or say plainly that they cannot.
   A task with no adversarial input path gives `growth.ts` nothing to measure.
5. **Do not name the trap in the prompt.** State requirements at the purpose
   level. Naming the trap tests instruction-following; the interesting question is
   whether it is recognized unprompted.

## Standing limits

- n = 1 per arm. No replication, no statistics, no capability claim.
- No independent reviewer has read any of this
  (`research/gate-m-verdict.md:18-30`). Analysis is author-produced and
  un-blinded.
- Arm directories are named for their models, so analysis after output lands is
  not blind. Copy to neutral names first if that matters.
- A test suite written by the arm that wrote the code is not evidence the code is
  correct. Cross-running each arm's suite against the other's implementation is
  more informative, and is the intended follow-up wherever both arms exist.
