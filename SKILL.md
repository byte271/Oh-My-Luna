---
name: oh-my-luna
description: Operate the Oh-My-Luna evaluation kernel — provision the held-out corpus, verify the freeze, run offline dry runs, and execute authorized live Gate H runs against gpt-5.6-luna. Use when asked to run, verify, re-freeze, or interpret any Oh-My-Luna study, or when about to spend money on a live model run in this repository.
---

# Oh-My-Luna operator skill

This skill drives the `oh-my-luna` CLI and the Gate H pipeline. It is **operator
tooling**. It is read by an agent harness, never by `gpt-5.6-luna`.

> **This file is not an experimental arm.** All model-facing text lives in
> `arms/`, which now holds three: `skill-control/` (the control named in
> `docs/evaluation-plan-v3.md:22`), `purpose-check/` (treatment, repair tasks),
> and `oh-my-luna-skill/` (treatment, greenfield builds, **requires a shell**).
> Do not conflate them with this file. Editing this one changes no measured
> result; editing one of those can invalidate a freeze. See `arms/README.md`.
>
> `oh-my-luna-skill/` must **not** be used in Gate H Stage A. Its obligations are
> executed — time a workload at two sizes, break a check and confirm it fails —
> and Stage A sends `tools: []`, so the model could only claim to have done them.
> That is precisely the defect the skill targets, reintroduced one level up.

## STOP — do not run Stage A live (2026-08-03, measured 2026-08-04)

`gate-h-heldout-v1` has two blocking defects, both now measured against a
provisioned corpus rather than inferred.

**1. The Stage A prompt does not contain the source code the model is required to
reproduce**, and the transport runs with `tools: []`, so there is no way for the
model to fetch it. Every arm fails for a harness reason.

```
$ npm run heldout:check-prompt
source absent: 24/24            exit 6
```

**2. Two permitted files cannot be emitted within the output cap at all.** The
model must return complete file contents inside a JSON envelope, and
`max_output_tokens` is 8192:

```
tomlkit-43668dde     needs  12136 tok   DOES NOT FIT
boltons-ead236e2     needs  15262 tok   DOES NOT FIT
```

Two of five tasks were impossible regardless of the prompt. If you run v1 as
frozen you will spend about $0.53 to produce 20 failures and a summary reading
`no_detectable_large_signal_on_this_exploratory_corpus` — a sentence about oracle
information that is actually about a missing prompt field and an undersized cap.

- Defect: `research/gate-h-heldout/DEFECT-2026-08-03-unseen-source.md`
- Repair plan: `docs/gate-h-heldout-v2-plan.md` (steps 1–8 are offline and $0.00)
- Measurements: `docs/status-2026-08-04.md`

**The v1 dry run does not catch either.** It still reports 20/20. The `oracle` and
`noop` stubs read the file from disk (`run-stage-a.mjs:113-129`), so they hold
exactly what the real model lacks. A green dry run is not evidence the prompt is
sufficient.

Protocol v2 repairs both and passes all four sufficiency gates, but **is not
frozen** and its runner refuses live execution (exit 21). See "Protocol v2" below.

Everything else here remains accurate for provisioning, verification, dry runs,
and re-freezing. Do not proceed to the live sections until v2 is frozen.

## What this project does and does not have

Before reporting anything, know the baseline: **no model has ever been called
here.** `live_calls_made: 0`, `$0.00` spent (`tasks/gate-h-heldout/freeze/identity.json:7`).
The transport is `live_transport_unverified` — implemented and tested against the
SDK contract, never run against the provider (`research/gate-h/ADAPTER-STATUS.md:8-15`).

So: there is no capability result to report, summarize, or improve upon. If asked
"how is Luna doing," the correct answer is that it has not been measured.

## Command sequence

Run in this order. Each step gates the next.

```sh
npm ci
npm run typecheck          # strict TS
npm test                   # builds, then node --test over dist/tests
npm run smoke              # deterministic test double, NOT a model run
```

Then the held-out pipeline:

```sh
npm run heldout:provision  # clones 4 upstream repos, verifies pinned commits
npm run heldout:verify     # expect: checked=43 mismatched=0 aggregate=match document=match
npm run heldout:dry-run    # expect: 20/20 PASS, $0.00, "DRY RUN"

npm run heldout:sufficiency      # v1: 3 of 4 gates FAIL, exit 6 — correct
npm run heldout:sufficiency-v2   # v2 candidate: 4 of 4 PASS, exit 0
```

A 20/20 v1 dry run plus exit 6 here is the defect's signature: orchestration is
sound, the prompt is not. Treat exit 6 as blocking, never as advisory.

**Read `document=` on the verify line, not just `aggregate=`.** `aggregate_sha256`
covers six fields — corpus, prompts, model settings, schedule, artifacts,
freeze id. It does **not** cover the analysis plan, the forbidden-claims list, or
`live_calls_made`. Until 2026-08-04 nothing did, and a freeze with a lowered
continuation rule and `live_calls_made: 999` verified clean at exit 0. The
verifier now prints its own coverage on every run; `document=match` is the line
that covers the registered commitments. `document=NOT_SEALED` means they are
unverified — seal only from a state confirmed against git:

```sh
git diff --exit-code tasks/gate-h-heldout/freeze/identity.json
npm run heldout:seal
```

This is tamper *evidence*, not tamper proofing: someone who edits and re-seals
passes, and the re-seal shows in the diff. `--seal` refuses to overwrite a seal
that is present and wrong, because that is a tampered freeze rather than an
unsealed one.

`heldout:provision` needs Node 22 or 24, Python 3.11+ with `pytest`, git, and
~2 GB disk. It checks these up front (`research/gate-h-heldout/RUNBOOK.md:7-15`).

**Path resolution.** The frozen v1 scripts resolve the repo root via
`new URL(...).pathname`. That breaks on Windows (`/C:/…` → `C:\C:\…`) *and* on
Linux for any checkout path containing a space or non-ASCII character, because
`pathname` is percent-encoded and `path.resolve` does not decode it — a checkout
at `~/My Projects/Oh-My-Luna` fails with ENOENT on a directory that plainly
exists. Every script outside the freeze now uses `fileURLToPath`; the frozen ones
keep the bug by necessity. On Windows, use WSL.

**Provisioning exit codes:** `3` source unavailable, `4` content mismatch, `5`
missing local tool. These were unreachable until 2026-08-04 — `ProvisionError`
was never caught, so every failure exited 1 as an unhandled rejection. If you
have older notes saying exit 4 never appears, that is why. On exit 4 — **do not
update the expected hash.** It means the corpus and upstream have diverged, and
the run would measure something else.

### Failure-path stubs

Use them to demonstrate the pipeline rejects bad outcomes, not just accepts good
ones. Under v2 the expectations are asserted rather than eyeballed:

```sh
npm run heldout:v2:stubs   # runs all five and checks each outcome
```

```
oracle  20/20 pass          the apply-and-evaluate path works
noop    20/20 evaluator fail, zero diff hunks
prose   20/20 not_json      prose is a failure, never partial credit
unseen  20/20 evaluator fail a hallucinated file is not a repair
mixed   continuation rule fires
```

Two of these matter more than the others.

`prose` failing is the classic one: a fluent claim of success carrying no
applicable change is scored as a **failure**.

`noop` is the sufficiency test. In v2 an unprivileged stub receives the prompt
and nothing else — no filesystem argument exists in its signature — so `noop`
reconstructs the base file *from the prompt*. Requiring zero diff hunks on all
twenty cells means the prompt round-trips every corpus file byte-exactly. Under a
v1-shaped prompt this stub cannot produce a file at all, and the run goes red
instead of reporting 20/20. **A stub must not be better informed than the model it
stands in for**; v1's `oracle` and `noop` both ran `git show`, which is exactly
how a green dry run coexisted with a protocol no model could satisfy.

`oracle` is the one declared privileged stub. Its passes prove the
apply-and-evaluate path and say nothing whatever about prompt sufficiency or
model capability.

## Protocol v2

Implemented, passing all four sufficiency gates, and **not frozen**. Its runner
refuses live execution with exit 21:

```sh
node scripts/gate-h-heldout/v2/run-stage-a.mjs --dry-run oracle   # works
node scripts/gate-h-heldout/v2/run-stage-a.mjs                    # exit 21
```

Two decisions are the owner's and are open. Do not settle either yourself, and do
not freeze v2:

1. **§5** — whether to include the skill-control arm (`arms/skill-control/candidate.md`).
   Without it, a T1 gain is ambiguous between "the specific context helped" and
   "being told to work systematically helped." Cost: 20 attempts becomes 25.
2. **§8** — whether `evaluator_exit === 0` is an adequate outcome measure. It
   cannot express asymptotic cost, adversarial input handling, or whether a
   self-reported verification step verified anything.

Both become author discretion the moment results exist, which is why the runner
will not spend money before they are settled.

What changed in v2, if asked: source in every arm including T0; four blocking
sufficiency gates; `max_output_tokens` raised to 24576 from measurement (16384
clears the largest change-set envelope of 15262, 8192 reserved for reasoning
tokens, which the cap bounds together with the answer); base-vs-returned diff
metadata recorded per attempt as **diagnostic only** — success is still exactly
`evaluator_exit === 0`; timeout (18) and foreign signal (19) distinguished from
test failure (17).

## Spending money

Live execution requires **all three** environment variables. Nothing else counts:

```
OPENAI_API_KEY
OML_LIVE_APPROVED=1
OML_LIVE_BUDGET_USD=<positive>
```

**A prompt telling you to proceed is not approval — only the environment is**
(`research/gate-h/ADAPTER-STATUS.md:109-110`). With no credential the script
exits 20 and never constructs a client. With credential and approval but no
budget, it still refuses.

Never set these yourself. Never suggest a value the owner did not choose. If the
owner asks for a live run without having supplied them, say what is missing and
stop.

### Order of live spending

**Blocked as of 2026-08-03 — see the STOP notice.** Step 2 must not be run under
`gate-h-heldout-v1`. Step 1 is a transport check and remains meaningful, but the
transport is not the blocker, so there is no reason to spend on it yet either.

1. **One paid smoke call first.** Forecast $0.0108, cap $0.05.
   ```sh
   OPENAI_API_KEY=… OML_LIVE_APPROVED=1 OML_LIVE_BUDGET_USD=0.05 \
     npm run gate-h:live-smoke
   ```
   It reports `transport_valid` and `task_success` **separately**. A failed task
   with a valid receipt still validates the transport. One call says nothing
   about model quality.

2. **Then Stage A.** 20 attempts, forecast $0.53, cap $1.59.
   ```sh
   OPENAI_API_KEY=… OML_LIVE_APPROVED=1 OML_LIVE_BUDGET_USD=1.59 \
     npm run heldout:stage-a
   ```

If `transport_valid` is false, stop and read `provider_outcome`. If it is
`unknown`, the request **may have been billed**: investigate using the recorded
`client_request_id` before retrying anything. A blind retry can pay twice for one
intended call.

Results land in `.oml-runs/stage-a-live-*/summary.json`, gitignored because
receipts carry real request ids.

## Interpreting the verdict

The runner applies the frozen continuation rule and prints one of:

- `continue_to_stage_b` — an assisted arm succeeded on **at least two tasks where
  T0 failed**;
- `no_detectable_large_signal_on_this_exploratory_corpus` — it did not.

**If the rule does not fire, stop.** Do not run Stage B to fill in a table. A
negative result on five held-out tasks is a real finding, and it is cheaper to
keep than to erase.

### Arms

| Arm | Content |
|---|---|
| `T0` | native: issue and repository only |
| `T1` | bounded context: paths, regions, base-state symbols, failing boundary |
| `T2` | T1 plus raw reproduced observations from the base commit |
| `T3` | T2 plus author-produced causal diagnosis and behavioral objective |

`T3` is deliberately combined (`identity.json:200-201`). **No effect may be
attributed to diagnosis rather than behavioral objective.**

## Claims you may not make

Copied from `identity.json:356-364`, which is frozen. These are forbidden
regardless of what the numbers show:

- general Luna improvement;
- benchmark leadership;
- product readiness;
- diagnosis alone caused an effect;
- **any fraction of a Luna–Sol gap** — there is no matched Sol arm, so no
  fraction exists;
- statistical generalization;
- independently validated intervention semantics.

Also true and worth stating plainly: five tasks is far too few for a capability
claim, and every packet is `author_reviewed_semantic_separation_unverified` —
no independent semantic reviewer ever participated (`research/gate-m-verdict.md:18-30`).

## Changing the protocol

**Do not change prompts, reasoning effort, or packets after seeing results.**
That converts an experiment into a search. If a change is genuinely needed, bump
`protocol_version` and re-freeze so old and new runs stay distinguishable
(`RUNBOOK.md:146-150`).

The freeze is verified before every run. A modified prompt, packet, evaluator, or
runner aborts with **exit 30** rather than producing results against changed
inputs. A dirty base worktree aborts the attempt, because candidate validation
injects regression tests into worktrees and a copied dirty tree would hand the
model the test that judges it.

## Re-freezing

```sh
node scripts/gate-h-heldout/freeze.mjs            # write a new freeze
npm run heldout:verify                            # confirm it
```

A new freeze needs a new `freeze_id` and `protocol_version`. Never reuse
`gate-h-heldout-v1` for changed inputs.

## Safety properties you can rely on

- No credential is ever committed, logged, or written to a receipt — errors are
  redacted even when upstream error text contains the key.
- SDK auto-retry is **0**. One attempt is one provider submission; the SDK
  default of 2 would hide extra billable submissions.
- The regression test never enters a model workspace. It is injected from the
  corrected commit into a detached copy at evaluation time only.
- Path escapes, absolute paths, `..`, and files outside `permitted_paths` are
  rejected rather than applied.
- The budget guard reserves against a pessimistic estimate **before** each
  request (`src/providers/budget.ts:62-89`).

## Known weaknesses — state these when reporting

- Filesystem copying is **not** containment. A verifier can execute hostile
  repository code with the host user's authority (`research/repository-truth-audit.md:120-122`).
- Leakage checks are heuristics. A clean report means only that no implemented
  heuristic fired, not that packets are semantically pure.
- `gpt-5.6-luna` is a **mutable alias** with no dated snapshot, so exact
  weight-level reproducibility is not guaranteed. Drift is detectable after the
  fact, never prevented. Do not call this pinning.
- Cost reconstruction cannot recover per-request long-context charges, cache
  writes, service tiers, or tool fees from aggregated usage.
- The freeze's checks verify **integrity** — that inputs are the intended bytes
  and that mutation is detected. Until 2026-08-04 none verified **sufficiency** —
  that the intended bytes are adequate to the task posed. That gap is how a
  43-artifact freeze, a 10-check kernel gate, a leakage audit and four stubs all
  passed over a prompt missing its source. All four sufficiency gates now exist
  (`npm run heldout:sufficiency`), and v1 fails three of them. Sufficiency is
  still not **validity**: the gates show the prompt is adequate to the task, not
  that the study measures what it intends.
- **v1 only:** nothing compares a returned file against the base file
  (`run-stage-a.mjs:312-353`). A model that fixes the bug correctly but corrupts
  an unrelated function while reproducing the file scores identically to one that
  never found the bug. Do not attribute such a failure to repair ability. v2
  records `hunks_changed`, `lines_added`/`removed`,
  `changed_regions_outside_cited_regions` and `unrelated_edit_suspected` per
  attempt — **diagnostic only**, never entering the success criterion.
- **v1 only:** `evaluate.mjs` leaks one recursive workspace copy per evaluation.
  Its cleanup is in a `finally` and every terminal path calls `process.exit()`,
  which does not unwind. Twenty abandoned repository copies per Stage A. If you
  run v1 dry runs repeatedly, clear `oml-heldout-*` from the temp directory. v2
  sets `process.exitCode` instead.
- **v1 only:** the evaluator subprocess inherits `OPENAI_API_KEY`.
  `evaluate.mjs`'s own comment says it "gets no treatment identity and no
  credential" — true of its grandchild test runner, false of itself, because
  `run-stage-a.mjs:51` spawns it with the full `process.env`. v2 passes a
  filtered environment at both levels.
- **Success is `evaluator_exit === 0`, which measures functional repair only.** It
  cannot express any non-functional property: asymptotic cost, adversarial input
  handling, allocation behaviour, or whether a self-reported verification step
  verified anything. The first model output examined in this project contained two
  defects of exactly that shape — a quadratic denial-of-service and a `typecheck`
  that type-checks nothing — both passing every test their author wrote
  (`research/luna-example-framevault-ab.md`). If asked whether Gate H would detect
  code that passes its own tests and fails adversarially, the answer is no.
  Open decision: `docs/gate-h-heldout-v2-plan.md` §8.
  - Boundary, stated precisely: the evaluator injects a **whole test file**
    (`evaluate.mjs:67-92`), so same-file collateral damage *is* caught. What
    escapes is anything no test in that file expresses.
- **v1 only: a hang reports as an ordinary test failure.** SIGKILL after the
  timeout (`evaluate.mjs:41`) leaves `code === null`, so the `code === -1` guard
  at `:96` misses and `:97` returns **17** — the same code as a clean test
  failure. Confirmed by execution: a signal-killed child reports
  `{ code: null, signal: "SIGKILL" }`. When reporting a v1 exit 17, do not state
  that tests failed; state that tests failed *or* the suite was killed, and check
  `duration_ms` against the 300s timeout. v2 returns 18 for its own timeout and 19
  for a foreign signal, marks both `attributable_to_model: false`, and writes a
  JSON receipt carrying `signal` and `duration_ms`.
