# FrameVault A/B — the first Luna output in this project

```
sample:        Luna-example/01-framevault-skill-ab/ (tracked since 4bb4226; not frozen, not a corpus task)
arms:          Luna-a (owner states: with the Oh-My-Luna skill) vs Luna-b (without)
task:          greenfield build from Luna-example/01-framevault-skill-ab/Prompt.md, not a Gate H repair task
n:             1 per arm
established:   code reading only. Neither test suite was executed here.
capability:    none. This is not a result and must not be cited as one.
```

Read on 2026-08-03. This is the first model output of any kind to appear in this
repository. Everything prior — Gate A through H — is protocol, corpus and harness
with `live_calls_made: 0`.

It arrived outside the harness, so none of the machinery this project built
applies to it: no freeze, no leakage check, no evaluator, no receipt, no cost
record. It is a **sample**, in the ordinary sense. Its value is that it is the
first evidence about what Luna's code actually looks like, and it points at a
weakness the frozen instrument cannot see.

## The task

`Luna-example/01-framevault-skill-ab/Prompt.md` asks for a dependency-free TypeScript library and CLI
implementing a binary frame format: 4-byte magic `FVLT`, version, flags,
big-endian `uint32` payload length, payload, CRC-32 over everything preceding.

The requirements that carry the difficulty are all in requirement 1, the
streaming decoder:

- input may arrive one byte at a time, or several frames per chunk;
- garbage may precede a frame;
- **corrupted frames must not prevent later valid frames from being decoded**;
- declared lengths above a configurable limit must be rejected safely;
- **the decoder must never allocate memory based on an untrusted oversized length.**

Both arms produced a complete, plausible, internally consistent project. Both
self-report passing tests. Neither claim was verified here.

## Where the skill arm is better

These are real and worth stating first, because the headline finding below is
negative and it would be easy to read this document as one-sided.

| | Luna-a (skill) | Luna-b (control) |
| --- | --- | --- |
| CLI integration test | spawns the CLI, asserts recovery + exit 1 | **none** |
| Byte-exact encoding vector | `46564c5402100000000301020347f2b54e` | absent |
| Decoder-limit validation | rejects `-1` and `2³²`; rejects `push` after `end` | absent |
| `.gitignore` | present | **absent** |
| CLI npm scripts | `encode`, `decode` | absent |
| Configurable limit via env | `FRAMEVAULT_MAX_PAYLOAD_LENGTH` | absent |

The CLI test is the most substantive gap. The prompt devoted requirement 4 to
CLI behaviour, including that corrupted frames be reported without stopping
recovery. Luna-b tests none of it — its entire suite is library-level. Luna-a
spawns the built CLI against a stream containing a corrupted frame followed by a
valid one and asserts both the exit status and the recovered file
(`Luna-a/tests/framevault.test.ts:229-263`).

The byte-exact vector is the kind of test that catches a silent format change
that a round-trip test cannot: encode-then-decode passes even if both sides
change together.

### But "better test coverage" is too strong, and the tables cut both ways

Counted rather than assumed: **both suites have exactly 15 tests**, 13 covering
the same ground, 2 unique to each arm.

| Only Luna-a | Only Luna-b |
| --- | --- |
| the CLI, end to end (`tests/framevault.test.ts:229-263`) | `truncated-crc` (`test/framevault.test.ts:169-178`) |
| constructor limits and use-after-`end` (`:219-227`) | `push` does not retain the caller's buffer (`:82-94`) |

The byte-exact wire vector is not a separate test — it is an extra assertion
inside the determinism test both arms have (`Luna-a:216`), which is why it does
not appear as a row.

Both arms *define and emit* a `truncated-crc` code (`Luna-a/src/decoder.ts:440`,
`Luna-b/src/decoder.ts:214`); only Luna-b asserts it. Luna-b's buffer-aliasing
test is a real safety property — it zero-fills the caller's chunk after `push`
returns and then checks the decoded payload, catching a class of defect that
survives every round-trip test.

So the accurate statement is: Luna-a covers **integration and format pinning**,
Luna-b covers **error-code completeness and memory-aliasing safety**. Neither
suite dominates, and neither is larger. An earlier draft of this document said
Luna-a was simply better on coverage; counting does not support that.

## Where the skill arm is worse, and it is the requirement that mattered

Requirement 1 said the decoder must never allocate memory based on an untrusted
oversized length. **Luna-a satisfies the literal sentence and violates what it
protects against.**

`Luna-a/src/decoder.ts` tracks every magic occurrence as a `Candidate` and
resolves candidates in stream order. It never preallocates from a declared
length — that part is true, and its README says so (lines 61-62).

The cost is in how candidates are processed:

- `appendByte` (`:217-225`) is called once per input byte and calls
  `updateCandidateStates`;
- `updateCandidateStates` (`:250-297`) iterates **every** entry in
  `activeCandidates`;
- candidates leave the array only when the *front* one resolves
  (`resolveNormal` / `resolveRecovery`), or when a floor discards them.

So a front candidate that stays `pending` holds the array open while later magic
occurrences keep appending to it. Cost per byte becomes O(candidates), and the
array itself is attacker-sized.

Construct one frame declaring a legal payload — 16 MiB, inside the default
`DEFAULT_MAX_PAYLOAD_LENGTH` — and fill that payload with repeated 14-byte fake
headers, each declaring its own legal length. Every fake header appends a
candidate. The front candidate cannot resolve until its range completes at the
end of the payload, and `resolveNormal` (`:311-313`) breaks as soon as the front
is `pending`, so nothing is ever shifted off. Resolved candidates behind the
front are skipped by `continue` (`:253`) but still cost an iteration each.

That yields ~1.2M live `Candidate` objects, and summing the per-byte scan over
~16.8M bytes puts total loop iterations on the order of **10¹³** for a single
16 MiB frame.

Nothing here is an oversized declared length. Every length is legal. The
unbounded allocation is the candidate array, and untrusted input controls its
size. The requirement's wording is met; its purpose is not.

Luna-b is immune by construction. Its decoder is a three-state machine
(`search` / `header` / `body`) with fixed-size state. While consuming a payload
it does not scan for magic at all (`Luna-b/src/decoder.ts:145-158`), and it
copies in bulk via `subarray` + `set` rather than byte-at-a-time. Time is O(n),
memory is bounded by `maxPayloadLength`.

**The skill arm produced the denial-of-service. The control produced the safe
implementation.**

## The tradeoff is real, and only one arm disclosed it

Luna-a's machinery buys something. Consider a false `FVLT` with a large declared
length, followed by a genuine frame inside that declared range:

- **Luna-a** keeps the false candidate pending, validates the real frame as a
  later candidate, and emits it once the false one resolves or at `end()`.
  The real frame survives.
- **Luna-b** treats the declared range as payload, consumes the real frame as
  payload bytes, fails CRC, and the real frame is gone permanently.

That is a defensible reading of "corrupted frames must not prevent later valid
frames from being decoded" — arguably a stronger one than Luna-b's. Luna-b's
README states the limitation plainly (line 25): a failed CRC "consumes the
declared candidate frame through its CRC field," which "prevents magic-looking
bytes embedded in corrupted payload data from being mistaken for nested frames."

Luna-a's README claims the benefit (lines 65-67) and does not mention the
quadratic cost.

So: Luna-a is more recovering, Luna-b is more predictable. Either is defensible.
Only Luna-b documented what it gave up.

## A verification script that verifies nothing

`Luna-a/scripts/typecheck.mjs` reads six files, calls `stripTypeScriptTypes` on
each, and prints:

```
Parsed 6 TypeScript files; tsconfig.json enables strict type checking.
```

Type stripping erases annotations. It throws on syntax errors and on a few
constructs it cannot strip. It performs **no type checking whatsoever**. No
`tsc` runs — none can, under the prompt's no-dependencies constraint.

`npm run typecheck` therefore passes green on code containing arbitrary type
errors, and `Luna-a/README.md:96-100` lists it among the verification commands.
The sentence it prints is true about `tsconfig.json` and false as an implication
about what just happened.

Luna-b shipped no typecheck script. Less complete, and it asserts nothing it
cannot support.

This is worth recording beyond its size, because it is
[the repository's own defect, reproduced independently](../docs/status-2026-08-03.md):
a check that confirms the bytes parse, labelled as confirming they are correct.
See also `docs/gate-h-heldout-v2-plan.md` §2 — integrity versus sufficiency. The
model made the same category error the harness authors made, in a different
domain, unprompted.

## Shared

Both shipped `dist/` despite "Inspect the final directory and remove temporary or
generated junk." Luna-a at least declares it in `.gitignore`; Luna-b has no
`.gitignore`, so its generated output is simply loose.

## Why the frozen Gate H evaluator would score these identical

This is the finding that bears on the project rather than on FrameVault.

`evaluate.mjs` injects whole test files from the corrected commit and runs them
(`:67-92`), then exits `0` on pass and `17` on anything else (`:97`). Success is
exactly `evaluator_exit === 0`.

Against that measure:

- the quadratic DoS **passes**. Every test Luna-a wrote passes. The pathological
  input is not in any suite, and no test measures asymptotic cost.
- the false-assurance typecheck **passes**. It exits 0 by construction.

Both are real defects. Both are invisible. Two notes on precision:

**The evaluator does catch same-file collateral damage.** It injects an entire
test file, not one test, so a repair that breaks other behaviour covered by that
file fails. This is stronger than pass/fail on a single test, and it is worth
being accurate about: the gap is not "the evaluator is blind to collateral
damage" but "the evaluator is blind to defects no test in the injected file
expresses" — which includes every non-functional property.

**A hang is recorded as an ordinary test failure.** `run()` kills the child with
SIGKILL after 300s (`:41`). A signal-killed child reports `code === null` at
`close`, so the `code === -1` check at `:96` does not fire and `:97` returns
**17** — the same code as a clean test failure. A quadratic blowup that timed out
would therefore be indistinguishable in the receipts from "the fix was wrong."

**Executed 2026-08-04 and confirmed:** a signal-killed child reports
`{ code: null, signal: "SIGKILL" }`, so the guard cannot fire. Repaired in the v2
evaluator, which returns 18 for its own timeout and 19 for a foreign signal, marks
both `attributable_to_model: false`, and records `signal` and `duration_ms`. v1
keeps the behaviour: `evaluate.mjs` is inside the freeze.

The T0–T3 ladder does not help. It varies *information supplied*, and neither
defect is caused by missing information. Adding source to the prompt (v2 §1)
does not touch this either. It is a third confound, independent of the missing
source and the missing base-vs-returned diff, and it lives in the **outcome
measure** rather than in the prompt.

If Luna's real weakness is code that passes its own tests and fails
adversarially, five pass/fail repair tasks cannot detect it, and a null result
would be reported as "no detectable signal."

## Provenance gaps

Enumerated rather than glossed, on the same standard applied to the
effort-parity claim in `data/provider-evidence/effort-parity-2026-08-03.json`.

| Item | Status |
| --- | --- |
| Which arm used the skill | **owner assertion.** Nothing in the files records it |
| Which skill text was used | **absent.** Not `arms/skill-control/candidate.md` — that targets JSON-object repair output, not a greenfield build |
| Model identity and version | **absent.** No record that `gpt-5.6-luna` produced either |
| Reasoning effort | **absent** |
| Timestamps, transcripts, token counts, cost | **absent** |
| "Tests pass" | **EXECUTED 2026-08-04. True of both arms:** 15/15 each, exit 0 |
| Quadratic DoS | **EXECUTED 2026-08-04. Confirmed.** See below |
| Directory is version-controlled | **yes, since commit 4bb4226.** It was untracked when this document was written |
| Replication | **none.** n=1 per arm, one task, one prompt |

The shell was unavailable for this entire session, so neither suite was run and
the DoS was not demonstrated. It is an argument from reading `appendByte` and
`updateCandidateStates`, and it should be confirmed by execution before being
relied on:

```sh
cd Luna-example/01-framevault-skill-ab/Luna-a && npm test        # confirm the suite passes at all
cd Luna-example/01-framevault-skill-ab/Luna-b && npm test
```

A direct DoS demonstration needs a crafted input: one frame declaring a legal
16 MiB payload, its payload filled with repeated 14-byte `FVLT` headers each
declaring a legal length. Feed it to both decoders and compare wall time. That
test does not exist in either arm.

A runnable probe now exists at `Luna-example/01-framevault-skill-ab/dos-probe.mjs`. It does not run the
full 16 MiB attack — that is ~1.2M candidates and ~10¹³ iterations, which would
hang — but feeds identical, increasingly large candidate-packed frames to both
decoders and reports wall time per doubling. The prediction, if the reading is
correct: Luna-a trends toward **~4× per doubling** (quadratic), Luna-b toward
**~2×** (linear). The doubling ratio, not the absolute time, is the evidence.

```sh
node --experimental-strip-types Luna-example/01-framevault-skill-ab/dos-probe.mjs
```

**Not yet executed.** The shell classifier was intermittently unavailable across
both sessions in which this was written; the probe's own logic is verified by
reading (it calls each arm's real `encodeFrame`/`FrameDecoder`, and the outer
frame is a valid encode so the cost accrues while the front candidate is pending),
but the numbers it would print have not been observed. Run it before citing the
DoS as demonstrated rather than reasoned.

## Executed 2026-08-04 — the asymptotic claim holds

Everything above about the quadratic blowup was established by reading
`Luna-a/src/decoder.ts`. `Luna-example/01-framevault-skill-ab/dos-probe.mjs` was written to test it and
could not be run in that session. It has now been run.

Both suites first, since "tests pass" was self-reported by both arms:

```
Luna-a: 15 tests, 15 pass, 0 fail   exit 0
Luna-b: 15 tests, 15 pass, 0 fail   exit 0
```

Then the doubling series. The ratio per doubling is the finding, not the
absolute time: a linear decoder trends toward 2x, a quadratic one toward 4x.

```
Luna-a (skill arm) — multi-candidate resync
  candidates   payloadKiB      ms     ratio-vs-prev
       1000          13     28.8          —
       2000          27     76.3      2.65x
       4000          54    250.2      3.28x
       8000         109    961.3      3.84x
      16000         218   4381.1      4.56x

Luna-b (control)   — three-state machine
  candidates   payloadKiB      ms     ratio-vs-prev
       1000          13      0.9          —
       2000          27      0.6      0.65x
       4000          54      6.2     10.90x
       8000         109      1.7      0.27x
      16000         218      2.9      1.75x
```

Luna-a converges on 4x per doubling — quadratic, as reasoned. 218 KiB of input
occupies it for 4.4 seconds. Luna-b stays between 0.6 ms and 6.2 ms across the
whole series; its ratios are noise around a flat line, and the 10.90x row is JIT
warm-up on sub-millisecond measurements, not growth. Read the absolute column
there, not the ratio.

The attack in the analysis declares a 16 MiB payload, about 1.2M candidates —
75x the largest point measured. Under the measured quadratic growth that is on
the order of 75² ≈ 5,600x of 4.4 s, or several hours, from 16 MiB of input. The
probe deliberately stops short of running it.

Two things this does **not** establish. It does not show that a model produced
either arm, or which arm used a skill; the provenance table above is unchanged
and still governs. And n=1 per arm cannot support any claim that a skill causes
this class of defect.

What it does establish is the part §8 of the v2 plan turns on, and it is now a
measurement rather than an inference: **a program can pass every test its author
wrote, at 15/15, while carrying a denial of service reachable from untrusted
input.** Under `evaluator_exit === 0` that is indistinguishable from clean work.
The spec's literal anti-allocation requirement is satisfied throughout — every
declared length in the attack is legal — and its purpose is defeated.

Supported:

- a model output sample now exists in this project, and it is not a benchmark
  result;
- on this one task, the two arms differ in ways that a pass/fail repair
  evaluator would not register;
- there exists at least one plausible defect class — non-functional, adversarial,
  self-consistent — that Gate H's success criterion cannot express.

Not supported, and not to be inferred:

- that the skill helps, hurts, or does nothing. n=1 per arm, unverified
  provenance, self-reported results, one task, no replication;
- that Luna specifically produced this. No arm records a model identity;
- anything about Luna versus Sol. There is no Sol arm here either;
- that Luna-a's implementation is worse overall. It is better on CLI coverage,
  packaging and format pinning, and worse on adversarial robustness and honest
  verification; the two suites are close in size and each covers something the
  other misses.

The forbidden-claims list (`tasks/gate-h-heldout/freeze/identity.json:356-364`)
applies to this document in full.
