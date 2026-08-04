# Running the held-out Gate H pilot locally

Everything below runs on your machine with your own credential. Nothing in this
repository can spend money on its own.

## Prerequisites

- **Linux or macOS.** The `scripts/gate-h-heldout/` scripts derive the repository
  root from `new URL(...).pathname`, which yields `/C:/Users/…` on Windows and
  resolves to a nonexistent `C:\C:\Users\…`. The freeze was validated on
  `platform: linux` (`freeze/identity.json:15`). On Windows, use WSL. This is
  recorded as a portability fix for the v2 re-freeze — the affected scripts are
  inside the freeze and must not be patched under v1.
- **Node 22 or 24** (both validated: v22.22.2, v24.18.1)
- **Python 3.11+ with pytest** — `pip install pytest`. Two of the five tasks are
  Python and the evaluator shells out to `python3 -m pytest`.
- **git**, and network access for provisioning only.
- Roughly **2 GB** of disk for the corpus cache.

`npm run heldout:provision` checks all of these up front and tells you which is
missing rather than failing halfway through.

## 1. Set up

```sh
git clone https://github.com/byte271/Oh-My-Luna
cd Oh-My-Luna
git checkout research/gate-h-held-out-pilot
npm ci
npm run heldout:provision
```

Provisioning clones the four upstream repositories, materializes the five base
worktrees, installs their dependencies, and **verifies every pinned commit
against its frozen `git archive` hash**. A mismatch aborts with exit 4 — do not
"fix" it by updating the expected hash; it means the corpus and the upstream
source have diverged and the run would be measuring something else.

Exit codes: `3` source unavailable, `4` content mismatch, `5` missing local tool.

## 2. Confirm the freeze before spending anything

```sh
npm run heldout:verify     # expect: checked=43 mismatched=0 aggregate=match
npm run heldout:dry-run    # expect: 20/20 PASS, $0.00, "DRY RUN"
```

The dry run substitutes a deterministic stub for the model, so it proves the
whole pipeline — prompt assembly, output parsing, patch application, evaluation,
receipts, budget accounting — **without contacting a provider**. If this does
not show 20/20, stop; a live run would only waste money.

> **20/20 is necessary but not sufficient — read this before step 3 (2026-08-03).**
>
> A green dry run does **not** establish that the prompt is adequate. It proves
> the pipeline can carry a correct answer from a stub to a passing test. It
> cannot prove the prompt contains enough for a real model to produce that
> answer, because the `oracle` and `noop` stubs read the file from disk
> (`run-stage-a.mjs:113-129`) — they hold precisely what the model lacks.
>
> `gate-h-heldout-v1` fails exactly there: the prompt omits the source the model
> must reproduce, and the transport sends `tools: []`. Run the sufficiency check:
>
> ```sh
> node scripts/gate-h-heldout/check-prompt-completeness.mjs
> ```
>
> Exit `0` source present · `6` source absent (the defect) · `7` not provisioned.
> **Exit 6 is blocking.** Do not continue to step 3 or 4; go to
> `../../docs/gate-h-heldout-v2-plan.md`. Full analysis in
> `DEFECT-2026-08-03-unseen-source.md`.

Other stubs, if you want to see the failure paths:

```sh
node scripts/gate-h-heldout/run-stage-a.mjs --dry-run prose   # 20/20 fail: prose is not success
node scripts/gate-h-heldout/run-stage-a.mjs --dry-run noop    # 20/20 fail: no-change cannot pass
node scripts/gate-h-heldout/run-stage-a.mjs --dry-run mixed   # continuation rule fires
```

## 3. One paid smoke call — do this before Stage A

```sh
OPENAI_API_KEY=sk-… \
OML_LIVE_APPROVED=1 \
OML_LIVE_BUDGET_USD=0.05 \
  npm run gate-h:live-smoke
```

One task, one T0 attempt, no tools, no retries. Forecast **$0.0108**, hard cap
**$0.05**.

It reports two things separately, and they must not be conflated:

- `transport_valid` — the provider accepted the request and the receipt captured
  a real response id, real token counts and the returned model;
- `task_success` — the repository task actually passed.

**A failed task with a valid receipt still validates the transport.** One call
says nothing about model quality.

Check the receipt in `.oml-runs/live-smoke/`. If `transport_valid` is false,
stop and read `provider_outcome`. If it is `unknown`, the request may have been
billed — investigate with the recorded `client_request_id` before retrying
anything, because a blind retry can pay twice for one intended call.

## 4. Stage A

Only after the smoke call succeeds:

```sh
OPENAI_API_KEY=sk-… \
OML_LIVE_APPROVED=1 \
OML_LIVE_BUDGET_USD=1.59 \
  npm run heldout:stage-a
```

20 attempts (5 tasks × 4 arms × 1), in the frozen seeded order. Forecast
**$0.53**, session cap **$1.59**. The guard reserves against a pessimistic
estimate before each request and stops the run rather than overspending.
Attempts are never retried.

Results land in `.oml-runs/stage-a-live-*/summary.json`, which is gitignored —
receipts contain real request ids and are not committed.

### What the verdict means

The runner applies the frozen continuation rule and prints one of:

- `continue_to_stage_b` — an assisted arm succeeded on **at least two tasks
  where T0 failed**;
- `no_detectable_large_signal_on_this_exploratory_corpus` — it did not.

**If the rule does not fire, stop.** Do not run Stage B to fill in the table.
A negative result on five held-out tasks is a real finding and costs nothing
further to keep.

## 5. What you may and may not conclude

Permitted after Stage A:

- a large exploratory signal was, or was not, observed on this small frozen corpus;
- the interventions were author-produced and their semantics were not independently reviewed;
- T3 combines diagnosis and behavioral objective;
- five tasks is far too few for a capability claim.

Forbidden regardless of the numbers:

- Luna is generally improved;
- any fraction of a Luna–Sol gap closed — there is no matched Sol arm, so no fraction exists;
- diagnosis alone caused an effect — T3 cannot be decomposed;
- product readiness, benchmark leadership, or statistical generalization.

### What a pass does not mean

Success is `evaluator_exit === 0` against an injected test file. That is
**functional repair against that file's assertions**, and nothing more. It does
not mean the returned code is efficient, safe against adversarial input, bounded
in allocation, or free of defects the test does not reach.

Two boundaries, stated precisely because the loose version is wrong in both
directions:

- the evaluator injects a **whole test file**, not one test, so a repair that
  breaks other behaviour covered by that file **does** fail;
- what escapes is anything no test in that file expresses — every non-functional
  property.

This stopped being hypothetical on 2026-08-03: the first model output examined in
this project contained a quadratic denial-of-service and a verification script
that verified nothing, both passing every test their author wrote
(`../luna-example-framevault-ab.md`). Whether Gate H should measure that class at
all is an open decision in `../../docs/gate-h-heldout-v2-plan.md` §8.

### Reading exit 17

On the two Python tasks `pytest` runs with `-x` (`evaluate.mjs:80`), so it stops
at the first failing assertion and the receipt shows that failure, not all of
them. The TypeScript runners are not passed an equivalent flag.

More importantly, **17 does not only mean "tests failed."** The evaluator kills
the child with SIGKILL after 300s (`evaluate.mjs:41`). A signal-killed child
reports `code === null`, so the `code === -1` guard at `:96` does not fire and
`:97` returns 17 — the same code as a clean test failure. When you see a 17,
check the attempt's wall time before concluding the fix was wrong. Reasoned from
Node's `close` semantics, not yet executed; a distinct timeout code is queued for
the v2 re-freeze.

## Safety properties you can rely on

- **No credential is ever committed, logged, or written to a receipt.** Errors
  are redacted, including when upstream error text contains the key.
- **The freeze is checked before every run.** A modified prompt, packet,
  evaluator or runner aborts with exit 30 rather than producing results against
  changed inputs.
- **A dirty base worktree aborts the attempt.** Candidate validation injects
  regression tests into worktrees; if such a tree were copied into a workspace
  the model would be handed the test that judges it. This is asserted per
  attempt, not assumed.
- **The regression test never enters a model workspace.** It is injected from
  the corrected commit into a detached copy at evaluation time only.
- **SDK auto-retry is 0.** One attempt is one provider submission; the SDK
  default of 2 would hide extra billable submissions.
- **Prose is a failure.** A confident natural-language claim carrying no
  applicable change is recorded as a failed attempt.

## If you want to change something

Don't change prompts, reasoning effort or packets after seeing results — that
converts an experiment into a search. If a change is genuinely needed, bump the
protocol version and re-freeze, so the old and new runs stay distinguishable.
