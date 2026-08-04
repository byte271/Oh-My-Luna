# Defect — Stage A asks the model to rewrite source it was never shown

```
found:       2026-08-03, by reading the frozen pipeline
severity:    blocking; invalidates Stage A as a capability measurement
affects:     gate-h-heldout-v1, all four arms, all five tasks
cost to date: $0.00 — found before the first live call
status:      CONFIRMED BY EXECUTION 2026-08-04. 24/24 combinations, exit 6.
             Repaired in the v2 candidate, which passes all four gates.
             v2 is not frozen; see docs/gate-h-heldout-v2-plan.md §5 and §8.
```

> **Executed 2026-08-04.** The check written on 2026-08-03 could not be run in
> that session. It has now been run against a provisioned corpus:
>
> ```
> $ npm run heldout:check-prompt
> source absent: 24/24            exit 6
> ```
>
> The prompt-size corroboration below is also now measured rather than inferred:
> assembled v1 prompts are **131–738 tokens** against a forecast of 18,000–21,000.
> The gap is 30x–140x, and it is the size of the missing source.
>
> The "second, independent risk" in §*Output cap* is no longer unmeasured. See
> that section.

## The defect

The frozen system prompt requires complete file contents
(`tasks/gate-h-heldout/freeze/identity.json:203`):

> Reply with a single JSON object and nothing else:
> `{"files":[{"path":"…","contents":"<complete new file contents>"}]}`
> Every file you list is written verbatim, so each `"contents"` must be the
> entire final file, not a fragment or a diff.

The prompt sent to the model never contains that file. `buildPrompt`
(`scripts/gate-h-heldout/run-stage-a.mjs:137-145`) assembles exactly two pieces:

1. `visible/issue.md` — a prose bug report;
2. for T1–T3 only, `packet.payload` serialized as JSON.

Every payload is **metadata about** the source, never the source. Verified by
reading all three arms of `scule-57cfd152`:

| Arm | Payload contents | Source code? |
| --- | --- | --- |
| T0 | *(no payload)* | no |
| T1 | `regions:[{path,start_line:1,end_line:60}]`, symbol names, `failing_boundary` | no |
| T2 | T1 + one `observation.facts[].statement` (test output text) | no |
| T3 | T2 + diagnosis and behavioral objective | no |

`T1.json:8-37` cites `src/index.ts` lines 1–60 as a *region* — a path and two
integers. The 60 lines themselves are not included.

And the model cannot go get it: the transport sends `tools: []`
(`identity.json:214`), so there is no read capability, and `store: false` means
no prior turn to draw on. Each attempt is one stateless Responses call
(`run-stage-a.mjs:244-256`).

The task template makes this worse by asserting something false
(`identity.json:205`):

> `Repository root contains the project source.`

There is no accessible repository root. The model is told it has access it does
not have, then asked for verbatim contents of a file it cannot read.

**Consequence:** every arm fails for a harness reason. T0–T3 would produce a flat
row of failures, the continuation rule would correctly report
`no_detectable_large_signal_on_this_exploratory_corpus`, and that verdict would
be recorded as evidence about *oracle information* when it is evidence about a
missing prompt field. A true null result and this defect are indistinguishable
from the summary alone.

## Why the dry run cannot catch it

The RUNBOOK instructs: "If this does not show 20/20, stop; a live run would only
waste money" (`RUNBOOK.md:40-46`). It does show 20/20. The defect survives it by
construction.

Both substantive stubs read the file from disk (`run-stage-a.mjs:113-129`):

```js
if (kind === "noop")   { … git show `${task.base_commit}:${path}`      … }
if (kind === "oracle") { … git show `${task.corrected_commit}:${path}` … }
```

The stubs hold exactly the thing the real model lacks. `oracle` proves
apply-and-evaluate works; it cannot probe whether the prompt was sufficient to
produce that output, because it never used the prompt. The four stubs vary the
**model's answer** while holding the **prompt** fixed and unexamined.

This is the failure mode the `mixed` stub was added to prevent — decision logic
that fails silently — occurring one layer up, in the input rather than the rule.

## Corroboration: the cost forecast assumes the source is there

`scripts/gate-h/forecast-cost.mjs:26-31` assumes per-request input tokens:

```js
T0: { input: 18_000, … }   T1: { input: 19_000, … }
T2: { input: 19_500, … }   T3: { input: 21_000, … }
```

The actual assembled prompt is an issue file of roughly 500 characters plus a
JSON payload of under 1 KB — on the order of **400 tokens**, not 18,000. The
~45× gap is the tell: the forecast was written for a prompt carrying file
contents, and the +1,000/+1,500/+3,000 increments across arms are the size of
*metadata* added on top of a source baseline that the implementation never adds.

The design intended source in the prompt. The implementation omits it. Nothing in
the freeze checks for it, because the freeze binds *hashes of* the prompt
template, not the semantic sufficiency of what it renders.

## Attempts to refute this finding

Per the takeover instruction to attack my own conclusions, five counter-arguments:

**"The model reconstructs small files from the issue."** No. `contents` must be
the *entire final file*, including every function unrelated to the defect. Exact
reproduction of unseen unrelated code is not a capability question; it is
impossible. Ranked by size, `boltons/iterutils.py` and `tomlkit/container.py` make
this obvious.

**"Some other code path adds the source."** `buildPrompt` is the only prompt
assembly in the script, and its result is passed directly as `input: prompt`
(`run-stage-a.mjs:195, 248`). `instructions` is the frozen system prompt. There is
no third field.

**"`materialize()` gives the model the workspace."** `materialize`
(`run-stage-a.mjs:148-166`) copies the base worktree into a scratch directory to
**apply the model's returned files and evaluate them**. It runs around the call,
not into it. The model never touches a filesystem.

**"It is intentional — a closed-book recall probe."** Contradicted by the stated
purpose. Gate H measures whether *correct information* helps repair
(`docs/evaluation-plan-v3.md:14-20`); T1 is defined as "bounded context"
(`identity.json:196`), which presupposes context is supplied. A recall probe would
also not bother with `permitted_paths` enforcement or region line numbers.

**"Prose-is-failure already covers this."** That control catches a model that
answers in prose. Here a *correct, cooperative* model still fails: asked for
verbatim contents of an unseen file, its options are refusal, prose, or a
hallucinated file. All three score as failure. The control fires on the symptom
and hides the cause.

The finding survives all five.

## Second, independent risk — output cap. MEASURED 2026-08-04: it fires

`max_output_tokens: 8192` (`identity.json:215`). If a permitted file exceeds that,
the response truncates, `validateProviderOutput` returns `response_incomplete`
(`src/providers/output-validation.ts:43-52`), and the attempt fails — again for a
harness reason. Whole-file output makes the cap a function of **file size**, not
answer length.

`boltons/iterutils.py` and `tomlkit/container.py` are both large modules and
plausibly exceed 8192 tokens. This was recorded as unverified; the corpus has now
been provisioned and both were measured.

```
tomlkit-43668dde     needs  12136 tok   DOES NOT FIT   (cap 8192)
boltons-ead236e2     needs  15262 tok   DOES NOT FIT
scule-57cfd152       needs   1359 tok   fits
scule-3815767f       needs   2091 tok   fits
ufo-5cd9e676         needs   4784 tok   fits
```

**It fires. Two of five tasks were impossible under v1 regardless of the first
defect**, exactly as this section warned.

Two refinements the original estimate did not make, both of which raise the
figure:

- The quantity that must fit is the **JSON-encoded envelope**, not the raw
  source. The model returns its file inside a JSON string, and escaping quotes,
  backslashes and newlines inflated this corpus by 3.2%–6.4%.
- A **multi-file task emits every permitted file in one response**.
  `scule-3815767f` has two permitted paths, so the per-file comparison the first
  version of the check performed was the wrong unit. It does not change the
  verdict here (2,091 tokens still fits) but it would on a larger task.

The v2 candidate raises the cap to 24,576 — 16,384 for the answer, clearing the
largest envelope by 7%, and 8,192 reserved for reasoning tokens, which
`max_output_tokens` bounds together with the answer. Shrinking the corpus to the
three tasks that fit 8,192 was considered and rejected: it would take five tasks
to three and remove both Python repositories, leaving a single-language corpus.
The rule and the rejected alternative are recorded in
`tasks/gate-h-heldout-v2/protocol.candidate.json`.

## Detection

The check now lives in `scripts/gate-h-heldout/check-sufficiency.mjs` as one gate
of four; `check-prompt-completeness.mjs` remains as its entry point because this
document, the RUNBOOK and SKILL.md all name it. Offline, free, no provider.

```sh
npm run heldout:provision       # required: reads files from the corpus cache
npm run heldout:check-prompt    # this gate only
npm run heldout:sufficiency     # all four gates
```

Exit `0` all pass · `6` source absent (the defect) · `7` not provisioned ·
`8` output cap · `9` template claim · `10` stub realism.

> **Executed 2026-08-04. Exit 6, `source absent: 24/24`** — the expected verdict,
> confirmed.
>
> Three defects in the original standalone implementation were corrected when it
> moved into the shared gate runner, and the first of them was serious enough to
> record here:
>
> - It **duplicated `buildPrompt` from `run-stage-a.mjs`**, carrying a comment
>   warning that the copy must be kept in step "or it silently stops measuring
>   reality." A sufficiency check that can drift from the thing it measures is not
>   a check. Both callers now import one definition from `src/heldout/prompt.ts`.
> - **Partial provisioning produced a complete-looking verdict.** It exited 7 only
>   when *nothing* resolved, so a corpus missing one repository reported a clean
>   pass over the remainder.
> - **A single mid-file probe line** could be satisfied by a T1–T3 assistance
>   packet quoting a base-state symbol, reporting a prompt as carrying source it
>   did not carry. Presence now requires several evenly spaced interior probes to
>   all appear.

## Fix — requires a re-freeze, not an edit

**Implemented 2026-08-04 as a candidate; not frozen.** The v2 protocol is at
`tasks/gate-h-heldout-v2/protocol.candidate.json` and passes all four sufficiency
gates. Its runner (`scripts/gate-h-heldout/v2/run-stage-a.mjs`) refuses live
execution with exit 21 while plan §5 and §8 remain open — those are owner
decisions, and settling either after results exist is the same failure as adding
an arm after results exist.

One hazard the minimal repair below introduces, found while implementing it and
recorded because it is silent: v1 assembles prompts with
`.replace("{{ISSUE}}", issue)`, and a **string** replacement expands `$&`,
`` $` ``, `$'`, `$1`–`$99` and `$$` inside the replacement text. No issue file in
the corpus contains a `$`, so v1 never triggered it — but source code does
routinely, and this fix puts source into the prompt. The corrupted prompt would
then have been hashed into `prompt_sha256` as though it were the intended text,
and the resulting failures attributed to the model. v2 substitutes every
placeholder in one pass with a function replacer, which performs no `$` expansion
and never rescans substituted text.

The arm set, prompts and settings are bound into `gate-h-heldout-v1`; changing the
template aborts with exit 30 (`RUNBOOK.md:130-134`). The fix belongs in
`gate-h-heldout-v2`. See `docs/gate-h-heldout-v2-plan.md`.

Minimal repair: include the **full current contents of every `permitted_paths`
file at the base commit** in *all* arms, T0 included, inside a delimited block,
with the template's false "Repository root contains the project source" claim
replaced by an accurate description of what is enclosed.

Rejected alternatives, and why:

- **Give the model read tools.** Converts a single-call protocol into an agentic
  one, and changes the question from "does correct information help?" to "can it
  navigate a repository?" Larger, costlier, different study.
- **Ask for a diff instead of whole files.** Reduces output size but not the
  defect: patching still requires seeing the code. Also discards the verbatim
  application property the evaluator depends on.
- **Include only the cited region.** Makes T0 impossible (T0 has no region) and
  bakes localization into the baseline, destroying the T0/T1 contrast.

Adding source to T0 does not weaken the ladder — it corrects it. With every arm
holding the source, arms differ only in the assistance metadata, which is what
the ladder was always meant to isolate. T1 then measures the value of *pointing*
at the right region rather than the value of *possessing* the file.

## Standing implication

This defect was reachable by reading `buildPrompt` against the system prompt, and
it survived a 43-artifact freeze, a 10-check kernel gate, a leakage audit, four
stubs and a written runbook. All of those verify **integrity** — that inputs are
the intended bytes and that mutation is detected. None verifies **sufficiency** —
that the intended bytes are adequate to the task posed.

`gate-h-heldout-v2` should add a sufficiency class of pre-flight check alongside
the integrity checks: at minimum, that the model is shown everything it is
required to reproduce, and that what it is required to reproduce fits the output
cap. Both are cheap, offline, and would have caught this.
