---
name: oh-my-luna
description: Operate the Oh-My-Luna evaluation kernel — provision the held-out corpus, verify the freeze, run offline dry runs, and execute authorized live Gate H runs against gpt-5.6-luna. Use when asked to run, verify, re-freeze, or interpret any Oh-My-Luna study, or when about to spend money on a live model run in this repository.
---

# Oh-My-Luna operator skill

This skill drives the `oh-my-luna` CLI and the Gate H pipeline. It is **operator
tooling**. It is read by an agent harness, never by `gpt-5.6-luna`.

> **This file is not an experimental arm.** The Gate H "lean fixed Skill" control
> named in `docs/evaluation-plan-v3.md:22` is model-facing prompt text and lives
> at `arms/skill-control/candidate.md`. Do not conflate the two. Editing this
> file does not change any measured result; editing that one invalidates a freeze.

## STOP — do not run Stage A live (2026-08-03)

`gate-h-heldout-v1` has a blocking defect. **The Stage A prompt does not contain
the source code the model is required to reproduce**, and the transport runs with
`tools: []`, so there is no way for the model to fetch it. Every arm fails for a
harness reason.

If you run it as frozen you will spend about $0.53 to produce 20 failures and a
summary reading `no_detectable_large_signal_on_this_exploratory_corpus` — a
sentence about oracle information that is actually about a missing prompt field.

- Defect: `research/gate-h-heldout/DEFECT-2026-08-03-unseen-source.md`
- Repair plan: `docs/gate-h-heldout-v2-plan.md` (steps 1–8 are offline and $0.00)

**The dry run does not catch this.** It still reports 20/20. The `oracle` and
`noop` stubs read the file from disk (`run-stage-a.mjs:113-129`), so they hold
exactly what the real model lacks. A green dry run is not evidence the prompt is
sufficient.

Everything below remains accurate for provisioning, verification, dry runs, and
re-freezing. Do not proceed to the live sections until v2 is frozen.

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
npm run heldout:verify     # expect: checked=43 mismatched=0 aggregate=match
npm run heldout:dry-run    # expect: 20/20 PASS, $0.00, "DRY RUN"

# Sufficiency check — asks whether the prompt contains what the model must
# reproduce. Currently expected to FAIL with exit 6; see the STOP notice.
node scripts/gate-h-heldout/check-prompt-completeness.mjs
```

A 20/20 dry run plus exit 6 here is the defect's signature: orchestration is
sound, the prompt is not. Treat exit 6 as blocking, never as advisory.

`heldout:provision` needs Node 22 or 24, Python 3.11+ with `pytest`, git, and
~2 GB disk. It checks these up front (`research/gate-h-heldout/RUNBOOK.md:7-15`).

**Linux or macOS only.** These scripts resolve the repo root via
`new URL(...).pathname`, which breaks on Windows (`/C:/…` → `C:\C:\…`). The freeze
was validated on `platform: linux`. Use WSL. Provisioning does **not** check this,
so on Windows the failure looks like a missing corpus rather than a path bug.

**Provisioning exit codes:** `3` source unavailable, `4` content mismatch, `5`
missing local tool. On exit 4 — **do not update the expected hash.** It means the
corpus and upstream have diverged, and the run would measure something else.

### Failure-path stubs

The dry run has four stubs. Use them to demonstrate the pipeline rejects bad
outcomes, not just accepts good ones:

```sh
node scripts/gate-h-heldout/run-stage-a.mjs --dry-run oracle  # 20/20 pass
node scripts/gate-h-heldout/run-stage-a.mjs --dry-run prose   # 20/20 not_json
node scripts/gate-h-heldout/run-stage-a.mjs --dry-run noop    # 20/20 evaluator fail
node scripts/gate-h-heldout/run-stage-a.mjs --dry-run mixed   # continuation rule fires
```

`prose` failing is the important one: a fluent claim of success carrying no
applicable change is scored as a **failure**, not a partial credit.

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
- Every check in the freeze verifies **integrity** — that inputs are the intended
  bytes and that mutation is detected. None verifies **sufficiency** — that the
  intended bytes are adequate to the task posed. That gap is how a 43-artifact
  freeze, a 10-check kernel gate, a leakage audit and four stubs all passed over
  a prompt missing its source. `check-prompt-completeness.mjs` is the first
  sufficiency check; `docs/gate-h-heldout-v2-plan.md` §2 adds three more.
- Nothing compares a returned file against the base file
  (`run-stage-a.mjs:312-353`). A model that fixes the bug correctly but corrupts
  an unrelated function while reproducing the file scores identically to one that
  never found the bug. Do not attribute such a failure to repair ability.
