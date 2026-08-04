# Defect — Stage A asks the model to rewrite source it was never shown

```
found:       2026-08-03, by reading the frozen pipeline
severity:    blocking; invalidates Stage A as a capability measurement
affects:     gate-h-heldout-v1, all four arms, all five tasks
cost to date: $0.00 — found before the first live call
status:      confirmed by code reading; automated check written, NOT YET RUN
```

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

## Second, independent risk — output cap, unmeasured

`max_output_tokens: 8192` (`identity.json:215`). If a permitted file exceeds that,
the response truncates, `validateProviderOutput` returns `response_incomplete`
(`src/providers/output-validation.ts:43-52`), and the attempt fails — again for a
harness reason. Whole-file output makes the cap a function of **file size**, not
answer length.

`boltons/iterutils.py` and `tomlkit/container.py` are both large modules and
plausibly exceed 8192 tokens. **This is unverified** — I could not measure the
files in this session. `check-prompt-completeness.mjs` computes it per task/path
(`exceeds_max_output_tokens`); run it before drawing any conclusion. If it fires,
whole-file output is unworkable for this corpus regardless of the first defect.

## Detection

`scripts/gate-h-heldout/check-prompt-completeness.mjs` re-implements Stage A's
prompt assembly, then checks whether a distinctive interior line of each permitted
file at its base commit appears in the rendered prompt. Offline, free, no provider.

```sh
npm run heldout:provision   # required: reads files from the corpus cache
node scripts/gate-h-heldout/check-prompt-completeness.mjs
```

Exit `0` source present · `6` source absent (the defect) · `7` not provisioned.

> **Not yet executed.** Written and reviewed in this session; the sandbox could
> not run it. Expected verdict on `v1` is exit 6 for all 20 combinations. Run it
> and record the output before acting on this document. The finding stands on the
> code reading above; the script exists to make it mechanical and repeatable.

## Fix — requires a re-freeze, not an edit

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
