# Held-out Gate H corpus — status

```
corpus:      FROZEN (gate-h-heldout-2026-08-02), document-sealed 2026-08-04
tasks:       5 across 4 repositories, 2 languages
live calls:  0
cost:        $0.00
capability:  none
v1:          NOT EXECUTABLE — two blocking defects, both now measured
v2:          implemented, passes all four sufficiency gates, NOT FROZEN
```

**No model has been run against any task in this corpus.** Nothing here is a
result.

> **2026-08-03 — this protocol must not be executed as frozen. Measured
> 2026-08-04.** The prompt does not contain the source the model is required to
> reproduce, so all four arms would fail for a harness reason and the flat result
> would be indistinguishable from a true null. Confirmed against a provisioned
> corpus: `source absent: 24/24`, exit 6.
>
> A **second v1 defect** surfaced in the same measurement and is independent of
> the prompt: two permitted files cannot be emitted within `max_output_tokens:
> 8192` at all. `tomlkit/container.py` needs ~12,136 tokens and
> `boltons/iterutils.py` ~15,262, measured on the JSON envelope the model must
> actually return. Two of five tasks were impossible under v1 regardless of what
> the prompt contained.
>
> Details: [`DEFECT-2026-08-03-unseen-source.md`](DEFECT-2026-08-03-unseen-source.md).
> Repair plan: [`docs/gate-h-heldout-v2-plan.md`](../../docs/gate-h-heldout-v2-plan.md).
> Measurements: [`docs/status-2026-08-04.md`](../../docs/status-2026-08-04.md).
> The freeze below stays as-is; v1 remains the record of what was believed.
>
> **A second, independent question is open** — whether `evaluator_exit === 0` can
> express the defect class this project cares about at all. Raised by
> [`research/luna-example-framevault-ab.md`](../luna-example-framevault-ab.md).
> As of 2026-08-04 it is no longer hypothetical: the sample's quadratic blowup was
> executed and confirmed (4.56x per doubling at the largest point measured) in an
> arm that passes 15/15 of its own tests. Still an owner decision, still owed
> before the v2 freeze; see plan §8.

## Corpus

| Task | Repository | Language | Base → corrected |
| --- | --- | --- | --- |
| `scule-57cfd152` | `unjs/scule` | TypeScript | `d2c281f1` → `57cfd152` |
| `scule-3815767f` | `unjs/scule` | TypeScript | `8a7a4b3d` → `3815767f` |
| `ufo-5cd9e676` | `unjs/ufo` | TypeScript | `a7b94e69` → `5cd9e676` |
| `tomlkit-43668dde` | `sdispater/tomlkit` | Python | `d3c76f0b` → `43668dde` |
| `boltons-ead236e2` | `mahmoud/boltons` | Python | `57cb026b` → `ead236e2` |

All five reproduce **base exit 17 / corrected exit 0** through the real
evaluator. None of these repositories was used anywhere in Oh-My-Luna
development.

## What "held out" means here

> Held out from protocol design, intervention-level design, adapter
> implementation, output-parser implementation, evaluator-framework design,
> leakage-detector tuning, baseline prompt tuning, reasoning-effort selection,
> and all previous Luna or Sol runs. **Not blind to the task and intervention
> authors**, who inspected each known correction to build the evaluator and
> author T1–T3.

This is **not** a hidden benchmark and is not described as one.

## Construction

16 candidates examined, 13 validated, 5 selected, 3 rejected, 8 not selected.

Candidates come from bugfix commits that ship their own regression test, so
base-fail and corrected-pass hold **by construction** rather than by hopeful
selection. The test is evaluator-only: it is injected from the corrected commit
at evaluation time into a detached copy, and never exists in a workspace a model
sees.

Selection ran under a mechanical policy — ≤2 tasks per repository, both
languages, smaller diffs preferred, deterministic tie-break — applied when **no
model result existed**, so it cannot have been biased by outcomes.

### Rejections, recorded not dropped

| Candidate | Reason |
| --- | --- |
| `destr-f9c78d40` | corrected version fails here: the test asserts on V8's JSON error text, which varies by Node version — an unstable evaluator |
| `destr-d9ba16d7` | same instability |
| `node-semver-e583226b` | corrected version fails in this environment; dependency/runner problem, not a task problem |

Eight further validated candidates were not selected, each with a recorded
reason (repository cap, or target size reached).

## Leakage

All 20 arm-task packets pass the mechanical checks; highest similarity to a
known repair is 0.177 against a 0.5 exclusion threshold.

One real leak was caught and fixed: the tomlkit T2 observation originally cited
the evaluator's test path, putting evaluator-only information into a
model-visible field. It was replaced with a self-contained reproduction that was
then verified against the base commit. That is a correction of an authoring
mistake, not a rewrite to defeat the detector — the similarity numbers were
never the problem.

**These checks are heuristics and do not establish semantic purity.** Every
packet remains `author_reviewed_semantic_separation_unverified`.

## Frozen

`gate-h-heldout-2026-08-02`, aggregate
`036d83902e678a7b4c65d6dddf7ba0fbb23fa74f55db5aec343cad83323ca48d`, **43
artifacts, 0 mismatches**, mutation detection tested.

> Corrected 2026-08-03. This section previously read *42 artifacts* and aggregate
> `1bae1f2f…`, which matched neither `freeze/identity.json` (`artifact_count: 43`,
> `aggregate_sha256: 036d8390…`) nor `RUNBOOK.md:38`, which already said
> `checked=43`. The freeze file is authoritative over prose describing it; the
> prose was stale.
>
> **Confirmed 2026-08-04.** `npm run heldout:verify` now run:
> `checked=43 mismatched=0 aggregate=match document=match`, exit 0.

Bound by `aggregate_sha256`: tasks, commits, permitted paths, evaluators, T0–T3
material, system prompt and task template with hashes, model alias and reasoning
effort (`low`), `store: false`, `tools: []`, retries 0, per-request cap $0.05,
session cap $1.59, and the seeded 20-attempt Stage A order.

> **Correction, 2026-08-04.** This paragraph previously ended "the continuation
> rule and the analysis plan." It did not bind those. `aggregate_sha256` covers
> six top-level fields — `freeze_id`, `artifacts`, `corpus`, `prompts`,
> `model_settings`, `schedule` — and `identity.json` is excluded from the artifact
> list, so `analysis_plan` (which holds the continuation rule),
> `forbidden_claims`, `status` and `live_calls_made` were bound by nothing.
>
> Demonstrated rather than argued: with the continuation rule lowered from "at
> least two tasks" to "at least ONE", the Luna–Sol forbidden claim deleted and
> `live_calls_made` set to 999, `--verify` printed
> `checked=43 mismatched=0 aggregate=match` and exited 0.
>
> `document_sha256` now covers the whole document, and `--verify` prints its own
> coverage on every run so `aggregate=match` cannot be read as a claim about
> fields it never touched. It is tamper *evidence*, not tamper proofing — an
> editor who re-seals passes, and the re-seal appears in the diff.
> [`docs/adr/0018-freeze-covers-the-whole-document.md`](../../docs/adr/0018-freeze-covers-the-whole-document.md).

## Stage A runner — validated offline, zero cost

`scripts/gate-h-heldout/run-stage-a.mjs` executes the frozen schedule under the
frozen prompts and settings, verifying the freeze before it starts and refusing
to run live without all three authorization signals (verified: exit 20).

The whole pipeline was proven end to end with deterministic stubs, so the first
real dollar is not also the first test of the plumbing. **No provider was
contacted and nothing here is a model result.**

| Stub | Model output | Expected | Observed |
| --- | --- | --- | --- |
| `prose` | fluent claim of success, no change | all 20 fail | 20/20 `not_json` |
| `noop` | base file returned unchanged | all 20 fail | 20/20 evaluator exit 17 |
| `oracle` | corrected file contents | all 20 pass | 20/20 evaluator exit 0 |
| `mixed` | T0 unchanged, assisted corrected | rule fires | `continue_to_stage_b` |

The `mixed` stub exists because the other three produce uniform outcomes, so
the continuation rule's positive branch would otherwise have gone untested
until real data — exactly the kind of decision logic that fails silently.

`oracle` passing proves apply-and-evaluate works. `noop` failing proves the
evaluator cannot be satisfied by a change that changes nothing. `prose` failing
proves a confident natural-language answer is scored as a failure.

> **The limit of this table, recorded 2026-08-04.** All four v1 stubs vary the
> model's *answer* while leaving the *prompt* unexamined, and two of them —
> `oracle` and `noop` — obtain file contents by running `git show`
> (`run-stage-a.mjs:113-129`). They hold precisely what the real model lacks.
> That is how a green 20/20 dry run coexisted with a protocol no model could
> satisfy, and why "the pipeline was proven end to end" is a narrower claim than
> it reads as.
>
> Generalized: **a stub must not be better informed than the model it stands in
> for.** In v2 this is enforced by a type rather than a convention — an
> unprivileged stub's signature is `({ prompt, permittedPaths }) => string`, with
> no filesystem argument to reach through. `noop` therefore reconstructs the base
> file *from the prompt* and must produce zero diff hunks on all twenty cells, so
> it fails under a v1-shaped prompt instead of passing. `oracle` stays privileged
> and is declared as such. A fifth stub, `unseen`, returns a plausible
> hallucinated file and is the regression test for the original defect.
>
> `npm run heldout:v2:stubs` asserts each outcome rather than leaving it to be
> eyeballed. All five hold.

## Stage A

20 attempts (5 tasks × 4 arms × 1). Forecast **$0.53–$0.80**; session cap
**$1.59**.

**Continuation rule, frozen before execution:** continue to Stage B only if at
least one assisted arm succeeds on **at least two tasks where T0 fails**.
Otherwise report *no detectable large signal* and stop — do not spend the
remainder to complete a table.

## Blocked on

Two independent blockers. The first is the binding one, and it is free to fix.

**1. Protocol defects (blocking, no credential needed). Engineering now done;
two owner decisions remain.** The Stage A prompt does not contain the source the
model must reproduce, and two of five tasks exceed the output cap. Fixing either
requires a re-freeze as `gate-h-heldout-v2`, not an edit — the freeze binds the
prompt template and mutation aborts with exit 30.

Steps 1–6 of
[`docs/gate-h-heldout-v2-plan.md`](../../docs/gate-h-heldout-v2-plan.md) are
**implemented** as of 2026-08-04, offline and at $0.00: source in every arm, four
blocking sufficiency gates, a cap set from measurement (24,576 = 16,384 answer +
8,192 reasoning), base-vs-returned diff metadata, and a timeout distinguished
from a test failure.

```sh
npm run heldout:sufficiency      # v1: 3 of 4 gates FAIL, exit 6
npm run heldout:sufficiency-v2   # v2: 4 of 4 PASS, exit 0
```

Steps 7 and 8 are **not** done, and are not engineering. Step 7 is two owner
decisions — the skill-control arm (§5) and the outcome measure (§8) — and step 8
is the freeze that would consume them. The v2 runner refuses live execution
(exit 21) until they are settled, because deciding either after results exist is
the same failure as adding an arm after results exist.

Running v1 as frozen would spend roughly $0.53 to produce 20 failures caused by a
missing prompt field and an undersized cap, and the summary would record
`no_detectable_large_signal_on_this_exploratory_corpus` — a sentence about oracle
information that would actually be about the harness.

**2. No credential, no approved budget.** Live execution requires `OPENAI_API_KEY`,
`OML_LIVE_APPROVED=1` and a positive `OML_LIVE_BUDGET_USD` together. This blocker
is not on the critical path and should not be resolved first: supplying a
credential now would only make the defective run possible.

## Open before the v2 freeze — what the success criterion can express

Not a blocker on running, but a decision that cannot be deferred past the freeze.

Success is exactly `evaluator_exit === 0` against injected tests. That measures
functional repair. It cannot express any non-functional property: asymptotic cost,
adversarial input handling, allocation behaviour, or whether a self-reported
verification step actually verified anything.

This became concrete rather than theoretical on 2026-08-03, when the first model
output in this project turned out to contain two defects of exactly that shape,
both passing every test their author wrote
([`luna-example-framevault-ab.md`](../luna-example-framevault-ab.md)). The T0–T3
ladder cannot reach them: it varies information supplied, and neither defect is
caused by missing information.

**Executed 2026-08-04, so it is no longer an inference.** Both suites run at
15/15, exit 0. The doubling series confirms the quadratic blowup — 2.65x, 3.28x,
3.84x, 4.56x per doubling, converging on 4x, while the control stays flat between
0.6 ms and 6.2 ms across the same range. A program green on every test its author
wrote holds a denial of service reachable from untrusted input, with every
declared length legal, and `evaluator_exit === 0` cannot see it.

This does not choose among §8's three options, and it says nothing about
provenance: n=1 per arm, and nothing in `Luna-example/` records a model identity.
It removes the option of treating the blind spot as hypothetical.

Being precise about the boundary:

- the evaluator injects a **whole test file** (`evaluate.mjs:67-92`), so a repair
  that breaks other behaviour covered by that file *is* caught;
- what escapes is anything no test in that file expresses.

Two implementation notes for the re-freeze, both offline:

- SIGKILL after the 300s timeout (`evaluate.mjs:41`) leaves `code === null`, so
  the `code === -1` guard at `:96` misses and `:97` returns **17** — a hang is
  recorded identically to a wrong fix. **Executed 2026-08-04 and confirmed:** a
  signal-killed child reports `{ code: null, signal: "SIGKILL" }`. Done in v2 —
  18 for our own timeout, 19 for a foreign signal, both carrying
  `attributable_to_model: false`, plus a JSON receipt with `signal` and
  `duration_ms`.
- A third defect, found 2026-08-04 and recorded nowhere before: v1's
  `evaluate.mjs` puts its scratch cleanup in a `finally` while every terminal
  path calls `process.exit()`, which does not unwind. One recursive workspace
  copy is abandoned in the temp directory per evaluation — twenty per Stage A.
  The injection-error path at `:70` cleans up explicitly, which is what shows the
  omission is a slip. v2 sets `process.exitCode` and returns; measured across 100
  v2 evaluations, zero directories left behind.
- Do not patch any of this under v1. `evaluate.mjs` is inside the freeze
  (`identity.json:376-400`) and mutation aborts with exit 30. The v2 replacements
  live at `scripts/gate-h-heldout/v2/`.

Three options, with costs, are in
[`docs/gate-h-heldout-v2-plan.md`](../../docs/gate-h-heldout-v2-plan.md) §8. The
decision is the owner's, and it must be made before results exist — choosing an
outcome measure after seeing results is the same failure as adding an arm after
seeing results.
