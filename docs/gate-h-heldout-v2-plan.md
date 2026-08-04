# Gate H held-out, protocol v2 — plan

```
status:            draft; nothing frozen, nothing run
supersedes:        nothing. gate-h-heldout-v1 remains the record of what was frozen
                   on 2026-08-02 and why it cannot be executed as-is
blocking input:    research/gate-h-heldout/DEFECT-2026-08-03-unseen-source.md
open decision:     §8, outcome-measure validity — owner's call, needed before freeze
                   motivated by research/luna-example-framevault-ab.md
live calls to date: 0        cost to date: $0.00
```

`v1` is not being rewritten. It stays exactly as frozen, with the defect recorded
against it. That preserves the property the project cares most about: an outside
reader can see what was believed, when, and what changed it.

## What v1 got right, and keeps

Carry forward unchanged. None of this is implicated in the defect:

- corpus construction — bugfix commits that ship their own regression test, so
  base-fail/corrected-pass holds by construction, not by hopeful selection;
- mechanical selection applied **before any model result existed**, with
  rejections and non-selections recorded rather than dropped;
- evaluator-only test injection into a detached copy; the test never enters a
  workspace the model sees;
- dirty-worktree refusal, asserted per attempt;
- three-signal live authorization; SDK auto-retry 0; uncertain calls never retried;
- pre-flight pessimistic budget reservation;
- prose-is-failure; path-escape and unrelated-file rejection;
- freeze verification before every run, with mutation abort;
- the forbidden-claims list.

## 1. Blocking fix — put the source in the prompt

Full analysis in the defect report. Summary: all four arms require complete file
contents while the prompt carries only metadata, and `tools: []` leaves no way to
read the file.

**Change.** Every arm, T0 included, receives the full contents of each
`permitted_paths` file at the task's base commit, in a delimited block. Arms then
differ *only* in the assistance metadata — which is what the ladder was always
meant to isolate.

Template becomes, in shape:

```
<issue>
{{ISSUE}}
</issue>
<source>
{{SOURCE}}          <!-- one block per permitted path, path-labelled -->
</source>
{{ASSISTANCE}}
Apply your fix and reply with the JSON object described in the system prompt.
```

Delete the line `Repository root contains the project source.` It is false under
`tools: []` and tells the model it has access it does not have.

**This reinterprets T1, and the reinterpretation must be stated.** Under v1's
intent, T1 was to supply "bounded context." With source in every arm, T1 measures
the value of **pointing at** the right region and symbols, not the value of
**possessing** the file. That is a narrower and more honest claim. Say so in the
freeze rather than letting a reader infer the older, broader one.

## 2. Sufficiency checks — a new class of pre-flight gate

The defect survived 43 frozen artifacts, a 10-check kernel gate, a leakage audit,
four stubs and a written runbook. Every one of those verifies **integrity** —
that inputs are the intended bytes, and that mutation is detected. None verifies
**sufficiency** — that the intended bytes are adequate to the task posed.

Add, all offline and free:

| Check | Asserts | On failure |
| --- | --- | --- |
| `check-prompt-completeness.mjs` | every file the model must reproduce appears in its prompt | exit 6 |
| output-cap headroom | `source_tokens + envelope` fits `max_output_tokens` | refuse to freeze |
| template-claim audit | the template asserts nothing about capabilities the transport does not grant | refuse to freeze |
| stub-realism assertion | no stub may read a file the model's prompt does not contain | refuse to freeze |

The last one is the general lesson. `oracle` and `noop` both `git show` the file
(`run-stage-a.mjs:113-129`); they hold what the model lacks, which is exactly how
20/20 PASS coexisted with a broken protocol. **A stub must not be more informed
than the model it stands in for.** Encode that as a check, not a convention.

## 3. The whole-file output contract — two unresolved consequences

Both follow from one decision: the model must emit complete final file contents.
Neither is a reason to abandon that contract, and both must be settled before
freezing.

### 3a. The output cap may be too low, and it is unmeasured

`v1` sets `max_output_tokens: 8192` (`identity.json:215`). Whole-file output makes
the cap a function of file size, not answer length. If a permitted file exceeds
it, the response truncates and `validateProviderOutput` returns
`response_incomplete` (`src/providers/output-validation.ts:43-52`) — a harness
failure wearing a capability failure's clothes.

`boltons/iterutils.py` and `tomlkit/container.py` are large modules and plausibly
exceed 8192 tokens. **Unmeasured.** Run the completeness check, which reports
`exceeds_max_output_tokens` per path, and set the cap from the measurement.

If large files cannot fit a defensible cap, that is a finding about the
whole-file output contract, and the honest response is to shrink the corpus to
tasks whose permitted files fit — **selected before any model runs**, by a
mechanical size rule, with exclusions recorded. Not to switch to diffs after
seeing results.

I could not measure this in the session where it was found: the corpus is not
provisioned (`.gate-h-heldout-cache` absent) and the freeze records no file sizes,
so the two suspect files are unread. The check reports the numbers; run it.

### 3b. Transcription fidelity is confounded with repair ability

Found by reading the full runner path, not just the prompt assembly. The returned
file is written whole into the workspace (`run-stage-a.mjs:329-333`) and pytest
runs against it (`:338`). **Nothing compares the returned file to the base file.**
`grep` for a diff across `scripts/` finds none; the only fields recorded are
`files_changed`, `unnecessary_files_changed`, and `false_completion`.

So an attempt fails identically whether the model (a) failed to find the bug, or
(b) found and fixed the bug correctly but corrupted an unrelated function while
reproducing several hundred lines verbatim. Both land as `evaluator_exit != 0`.

This gets worse, not better, once §1 puts the source in the prompt — the model now
has a long file in front of it and must echo all of it back. And it is not
symmetric across the comparison the project cares about: long-form verbatim
reproduction is plausibly one of the things a cheap model does worse. Attributing
a Luna transcription failure to Luna's *repair* ability would be precisely the
inference this repository exists to avoid.

**Fix — record the diff, do not change the contract.** At evaluation time, after
writing the returned file and before running tests, diff it against the base
commit and record per attempt:

| Field | Meaning |
| --- | --- |
| `hunks_changed` | count of changed regions |
| `lines_added` / `lines_removed` | size of the change |
| `changed_regions_outside_permitted_regions` | edits far from any cited region |
| `unrelated_edit_suspected` | heuristic: fails tests **and** edits scattered across the file |

This is diagnostic metadata only. It must **not** enter the success criterion:
success stays exactly `evaluator_exit === 0`, or the outcome becomes author-tunable
after the fact. The diff explains failures; it never creates passes.

Cheap, offline, and it makes the two failure modes distinguishable in the receipts
instead of merged in the summary. Without it, a flat row of failures is again
ambiguous — the same ambiguity as the original defect, one layer down.

> §3b is about **failed** attempts whose cause cannot be recovered. §8 below is
> the mirror image: **passed** attempts that conceal a defect. Both are
> measurement-validity problems; they point in opposite directions and need
> different fixes.

## 4. Study E — the effort–cost frontier

This addresses the owner's thesis that Luna at `max` effort approaches Sol at
`medium`. That claim is recorded, with its provenance gaps, in
`data/provider-evidence/effort-parity-2026-08-03.json`. It is unverified here and
is treated as a hypothesis, not a premise.

> Naming: this is **not** the "Gate E" referenced in `docs/adr/0006` from the
> original roadmap. It is a new single-factor study; the label is local to this
> document.

### It must not be crossed with the arm ladder

The obvious design — 4 arms × 4 effort levels × 5 tasks = 80 attempts — is
indefensible and I am rejecting it. At five tasks it multiplies arms against a
fixed tiny corpus, produces a garden of forking paths the frozen continuation rule
does not handle, and confounds the T0–T3 contrast with an effort effect. The repo
already forbids capability claims from 12–20 task pilots
(`docs/kill-criteria-v3.md`); an 80-cell design on 5 tasks is worse, not better.

**Instead: effort is its own single-factor study, on T0 only.**

```
5 tasks × 4 effort levels (low, medium, high, max) × 1 attempt = 20 attempts
```

Native Luna, no assistance. Outcomes: evaluator success, `reasoning_tokens`,
total cost, wall time, and **cost per success** — the decision variable, which no
document in this repository currently measures or even frames.

This leaves the arm ladder untouched and answers the owner's question directly. It
also has a genuine chance of a decision-relevant negative result: if success is
flat across effort, the effort premise is dead cheaply.

### The trap: raising effort without raising the output cap

In the Responses API, `max_output_tokens` bounds reasoning tokens **and** answer
tokens together. Setting `reasoning.effort: "max"` against `max_output_tokens:
8192` does not buy better answers — it buys responses that terminate incomplete
before emitting a file. Result: 0% success, attributable to the cap, not the model.

Anyone "just trying max effort" on the v1 settings would measure a floor and
conclude max effort is useless. Record this in the freeze so the mistake is not
available.

### Sequence it so the cost is measured, not guessed

`v1`'s forecast is built on assumed token counts, and the assumption is already
known wrong by ~45× on input (see the defect report). Do not guess again at max
effort, where reasoning tokens dominate and bill as output at $1.20/M.

The transport already records `reasoning_tokens` per response
(`run-stage-a.mjs:284`; `data/provider-evidence/excerpts/sdk-response-usage.md`).
So:

1. Run **one** T0 attempt at `low`. Read actual input, output and reasoning tokens.
2. Run **one** T0 attempt at `max` on the same task, with a raised cap. Read the
   reasoning-token count.
3. Forecast the remaining 18 attempts from those two measurements.
4. Set `per_request_cap_usd` and `session_cap_usd` from the forecast, then freeze.

At $1.20/M output, the v1 per-request cap of $0.05 permits roughly 41,000 output
tokens. That is probably adequate but is currently a guess; steps 1–2 replace it
with a number. Two calls cost pennies and remove the largest unknown in the design.

### Cost parity is the real question, and it is not settled by capability parity

Even if Luna@max matches Sol@medium on success, the 25:1 token-price ratio
(`research/luna-sol-gap.md:8-9`) does not survive intact: max effort spends
reasoning tokens billed as output. Whether Luna@max is *cheaper per success* than
Sol@medium is an empirical question with a plausible negative answer. Report
cost-per-success as a primary outcome, never success alone.

## 5. Skill-control arm — optional, decide before freezing

Candidate text at `arms/skill-control/candidate.md`. It is the model-facing "lean
fixed Skill" control named in `docs/evaluation-plan-v3.md:22`, and it is **not**
the repository-root `SKILL.md`, which is operator tooling an agent harness reads
and the model never sees.

Adding it takes Stage A from 20 to 25 attempts. It is worth including because
without it a T1 gain is ambiguous between "the specific context helped" and "being
told to work systematically helped."

Decide **before** freezing. Adding an arm after seeing results converts the
experiment into a search.

## 6. Ordering

Nothing here needs a credential except where marked.

1. `npm run heldout:provision`, then run `check-prompt-completeness.mjs`. Record
   the output. Expect exit 6 on v1.
2. From its `exceeds_max_output_tokens` column, set the output cap — or shrink the
   corpus by a mechanical size rule, recording exclusions.
3. Amend the template: add `{{SOURCE}}`, delete the false repository-root line.
4. Implement the four sufficiency checks; wire them into the freeze path so they
   can refuse.
5. Add base-vs-returned diff recording (§3b), as diagnostic fields only. In the
   same pass, distinguish a timeout/kill from a test failure in the evaluator's
   exit codes, and record `signal` and `duration_ms` (§8).
6. Re-run all four stubs. Add a fifth — `unseen` — that returns a plausible
   hallucinated file, and assert it fails. This is the regression test for this
   defect.
7. Decide on the skill-control arm; leakage-check it if included. Settle §8's
   outcome-measure question in the same pass — both are decide-before-freezing
   items, and both become author discretion the moment results exist.
8. Freeze as `gate-h-heldout-v2` with a new `freeze_id`. Verify.
9. **[credential]** One paid smoke call. Confirm `transport_valid`.
10. **[credential]** Two calibration calls for Study E token counts.
11. **[credential]** Stage A as frozen. Then Study E.

Steps 1–8 are the whole critical path and cost nothing. The project's binding
constraint has never been the credential; it is that the frozen protocol does not
yet pose an answerable question.

### Portability — the offline path does not run on Windows

Every script in `scripts/gate-h-heldout/` derives the repository root as:

```js
const root = resolve(new URL("../..", import.meta.url).pathname);
```

On Windows `.pathname` yields `/C:/Users/…`. `path.resolve` treats a leading
separator as "root of the current drive" and appends the rest verbatim, producing
`C:\C:\Users\…`, so every subsequent read fails. The correct form is
`fileURLToPath`, which is what `check-prompt-completeness.mjs` now uses.

This is **not** a defect on the validated platform. The freeze records
`platform: "linux"` (`identity.json:15`), and `.pathname` is correct there. It is
a portability gap, and it matters because the RUNBOOK's prerequisites list Node,
Python, git and disk — never an operating system — so a Windows operator follows
a documented path that cannot work.

Seven of these scripts are inside the freeze, including `run-stage-a.mjs` and
`evaluate.mjs` (`identity.json:376-400`). **Do not patch them under v1** — that
trips the mutation abort. Fix them as part of the v2 re-freeze, and add the
operating system to the RUNBOOK prerequisites or to the provisioning pre-flight
check.

> Confirmed by reading Node's `win32.resolve` behaviour, **not by execution** —
> the sandbox in this session could not run node. Verify with one command before
> relying on it:
> `node -e "const{resolve}=require('path');console.log(resolve(new URL('../..','file:///C:/a/b/c.mjs').pathname))"`

## 7. Verification owed on this document

Stated plainly so a later reader does not mistake reasoning for measurement.

| Item | Status |
| --- | --- |
| Source absent from prompt | **confirmed** by code reading; `check-prompt-completeness.mjs` written, **never executed** |
| No base-vs-returned diff anywhere | **confirmed** by reading `run-stage-a.mjs:312-353` and grepping `scripts/` |
| Two permitted files exceed the output cap | **unverified** — corpus not provisioned, freeze records no sizes |
| Windows path resolution breaks the offline scripts | **reasoned from Node semantics, not executed** — one command confirms it (§6) |
| `max_output_tokens` bounds reasoning tokens too | **unverified against current provider docs** — retrieval unavailable this session |

The last one matters for §4's trap. It is the documented behaviour of the
Responses API as understood here, but it was not re-checked against the live
reference, and the effort-parity claim in
`data/provider-evidence/effort-parity-2026-08-03.json` is likewise uncorroborated.
Confirm both before spending on Study E; neither blocks steps 1–8.

§8 was added after this table and carries its own; read both.

## 8. Outcome-measure validity — a third confound, and it is not in the prompt

Added 2026-08-03, after reading the first model output this project has ever seen
(`research/luna-example-framevault-ab.md`). It is numbered 8 rather than inserted
in order because §1–§7 are cited by number elsewhere.

§1 says the prompt is missing the source. §3b says the receipts are missing the
base-vs-returned diff. Both are about **inputs and instrumentation**. This one is
about the **success criterion itself**, and no amount of fixing the other two
touches it.

### What was observed

Two implementations of the same greenfield spec. One contains a quadratic
denial-of-service reachable from untrusted input — every declared length legal,
so the spec's literal anti-allocation requirement is satisfied while its purpose
is defeated. The same arm ships a `typecheck` script that runs
`stripTypeScriptTypes` and prints a sentence implying type checking occurred; it
exits 0 on code with arbitrary type errors.

Both defects **pass every test their own author wrote.** Against
`evaluator_exit === 0` they are indistinguishable from clean work.

### Why the ladder cannot reach it

T0–T3 vary *how much information the model is given*. Neither defect is caused by
missing information — the spec stated the anti-allocation requirement outright,
and the arm quoted it back in its README. Supplying the source file (§1) supplies
more of the same kind of thing. If the weakness is "produces code that satisfies
its own tests and fails adversarially," a ladder over information supply is
orthogonal to it.

### What the evaluator does and does not catch

Being precise, because the useful version of this claim is narrower than the
first one I wrote:

- **Caught.** `evaluate.mjs:67-92` injects a whole test file from the corrected
  commit, not a single test. A repair that breaks other behaviour covered by that
  file fails. Same-file collateral damage is genuinely detected.
- **Not caught.** Anything no test in the injected file expresses — which is every
  non-functional property: asymptotic cost, adversarial input handling,
  allocation behaviour, and the honesty of a self-reported verification step.

### A hang is recorded as an ordinary test failure

Found while reading the above. `run()` kills the child with SIGKILL after the
timeout (`evaluate.mjs:41`). A signal-killed child reports `code === null` at
`close`, so the `result.code === -1` guard at `:96` does not fire and `:97`
returns **17** — the same code as a clean test failure.

So the one symptom by which a quadratic blowup *could* have surfaced — the suite
timing out — is recorded identically to "the model's fix was wrong." This is the
same species of ambiguity as §3b, in the exit-code path rather than the diff path.

**Fix (offline, cheap, not blocking):** distinguish `code === null` with a signal
from a nonzero exit. Reserve a distinct code for timeout/kill. Record `signal` and
`duration_ms` per attempt. Do **not** patch under v1 — mutation abort; fold it
into the v2 re-freeze alongside §6's portability fix.

### The decision this forces, which is the owner's and not mine

Three options, stated with what each costs:

1. **Accept the limit and narrow the claim.** Gate H measures functional repair
   against a held-out test, and says so. Cheapest; changes nothing; means a null
   result cannot distinguish "no effect" from "effect invisible to this measure."
2. **Add a non-functional probe to the corpus.** Select some tasks whose injected
   tests include an adversarial or resource-bound case. Expensive: the corpus
   construction rule (bugfix commits shipping their own regression test) does not
   generally yield these, and hand-adding tests reintroduces author discretion at
   exactly the point the mechanical selection rule was designed to remove.
3. **Run a second, separate study on greenfield builds**, scored by an explicit
   rubric rather than pass/fail. Answers the question the FrameVault sample
   raises, but rubric scoring is author-produced and un-blinded — the weakness
   `research/gate-m-verdict.md:18-30` already records against this project.

I am not choosing unilaterally, and I am not writing an ADR for it. **Decide
before freezing v2** — adding an outcome measure after seeing results is the same
failure as adding an arm after seeing results (§5).

### Status of this section

| Item | Status |
| --- | --- |
| Quadratic DoS in the sample | **reasoned from code reading, not executed.** No profile, no timing |
| `typecheck` performs no type checking | **confirmed** by reading the script; `stripTypeScriptTypes` semantics not re-checked against current Node docs |
| Evaluator injects whole files, not single tests | **confirmed** — `evaluate.mjs:67-92` |
| SIGKILL yields exit 17, not 73 | **reasoned from Node `close` semantics, not executed** |
| The sample was produced by Luna, or by the skill | **owner assertion only.** No model identity, effort, or transcript is recorded anywhere in `Luna-example/` |

The last row bounds everything above. This section is motivated by a sample with
n=1 per arm and unverified provenance; it identifies a **possible** blind spot in
the measure, not a demonstrated one. That is still enough to require a decision,
because the decision must be made before results exist either way.

## What v2 still may not claim

Everything forbidden in `v1` remains forbidden (`identity.json:356-364`),
including any fraction of a Luna–Sol gap — there is still no matched Sol arm.

Additionally:

- **Study E cannot establish the effort-parity claim.** It has no Sol arm. It can
  only describe Luna's own effort/success/cost curve on five tasks.
- Fixing the defect does not make Stage A conclusive. Five tasks, one attempt per
  cell, remains exploratory.
- The skill-control arm, if included, is author-produced and
  `author_reviewed_semantic_separation_unverified` like every other packet.
- No independent semantic reviewer has participated in this project at any point
  (`research/gate-m-verdict.md:18-30`). v2 does not change that.
