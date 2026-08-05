# Oh-My-Luna

Oh-My-Luna is an experimental evaluation kernel for discovering whether a small,
model-specific external mechanism can improve GPT-5.6 Luna on repository tasks.

The repository does **not** yet contain a demonstrated intelligence amplifier.
It has no live Luna result, trained specialist, real provider adapter, or
attested sandbox. Its implemented value is controlled execution, scoring,
tracing, and negative safety checks. Context compilation is now implemented and
tested as a *mechanism* (`src/context/compile.ts`); whether it helps any model
is still a hypothesis. Capability composition and learned guidance remain
hypotheses until causal intervention tests identify Luna's actual bottleneck.

Current status:

- Gate A research and falsification: complete in the repository.
- Gate B architecture decisions: complete in the repository.
- Gate C evaluation skeleton: implemented.
- Gate D/E live Luna experiments: not run; this environment has neither an
  OpenAI API credential nor a Codex executable.
- Gate R0 reassessment: complete; pricing premise checked, receipt semantics
  corrected, and implemented/documentary boundaries audited.
- Gate M now has four exact-commit TypeScript defects across three repositories,
  each with base-fail/corrected-pass evidence, twenty pre-review L1-L5 drafts,
  and twenty blinded review bundles. The drafts are not approved packets and
  cannot be scheduled: no independent semantic reviewer participated, L3/L4
  collapse remains undecided, and evaluator separation is interface-level only.
  No live causal result or capability result exists.
- Gate H held-out pilot: corpus frozen (`gate-h-heldout-2026-08-02`, 5 tasks, 4
  repositories), runner validated offline against four deterministic stubs.
  **Not executable as frozen** — see below. 0 live calls, $0.00 spent.
- First model output examined: `Luna-example/01-framevault-skill-ab/` (sample,
  outside the harness, n=1 per arm, provenance unverified). Not a result; see
  below. `Luna-example/` is now a directory of comparisons, each with a frozen
  prompt and pre-registered scoring.
- Protocol v2: implemented and passing its sufficiency gates, **deliberately not
  frozen** — two owner decisions are open. See below and
  `docs/status-2026-08-04.md`.
- v0.3.0 long context: the degradation probe and the context compiler are
  implemented, tested, and wired together behind `npm run probe:context`. The
  premise they exist to test — that Luna degrades as context fills — is still an
  owner assertion; the probe can falsify it, and has not been pointed at a real
  model. See `docs/context-v030.md`.

## Known blocking defect in v1 (2026-08-03, measured 2026-08-04)

`gate-h-heldout-v1` must not be run live. The Stage A prompt does not contain the
source the model is required to reproduce, and the transport sends `tools: []`, so
every arm would fail for a harness reason. The resulting flat row of failures is
indistinguishable from a genuine negative finding about oracle information.

Now measured rather than inferred, against a provisioned corpus:

```
$ npm run heldout:check-prompt
source absent: 24/24            exit 6
```

The offline dry run does **not** catch this — it reports 20/20, because v1's
stubs read the file from disk and so hold exactly what the real model lacks.

A second v1 defect surfaced in the same measurement: two permitted files exceed
the output cap the model must emit them within — `tomlkit/container.py` at
~12,136 tokens and `boltons/iterutils.py` at ~15,262, against `max_output_tokens:
8192`. Two of five tasks were impossible under v1 regardless of the prompt.

- Defect: `research/gate-h-heldout/DEFECT-2026-08-03-unseen-source.md`
- Repair plan: `docs/gate-h-heldout-v2-plan.md`
- Sequencing decision: `docs/adr/0016-prompt-sufficiency-before-effort-axis.md`
- Detector: `npm run heldout:check-prompt`
- Reviews: `docs/status-2026-08-03.md`, then `docs/status-2026-08-04.md`

The critical path is offline and costs nothing. The absent API credential is a
second, non-binding blocker: supplying one now would only make a defective run
possible.

The general lesson, recorded because it generalizes past this bug: every existing
check verifies **integrity** — that inputs are the intended bytes and that
mutation is detected. None verified **sufficiency** — that the intended bytes are
adequate to the task posed. A 43-artifact freeze, a 10-check kernel gate, a
leakage audit and four stubs all passed over a prompt missing its source.

That pattern recurred twice more, and both instances are now fixed:

- **The freeze verifier reported success over fields it never hashed.**
  `aggregate_sha256` covers six of twenty-two top-level fields, and
  `identity.json` is excluded from the artifact list — so `analysis_plan`
  (containing the registered continuation rule), `forbidden_claims` and
  `live_calls_made` were unprotected. Demonstrated by lowering the continuation
  rule, deleting a forbidden claim and setting `live_calls_made: 999`, after
  which `--verify` still printed `mismatched=0 aggregate=match` and exited 0.
  Fixed by a document-wide seal; the verifier now prints its own coverage every
  run. `docs/adr/0018-freeze-covers-the-whole-document.md`.
- **The stubs were better informed than the model.** In v2 an unprivileged stub's
  type gives it the prompt and nothing else, so the rule is enforced by the
  signature rather than by a convention nobody checked.

## Model-facing text lives in `arms/`

`arms/` holds text delivered **to a model**; the root `SKILL.md` is operator
tooling an agent harness reads and a model never sees. Editing an arm can
invalidate a freeze; editing `SKILL.md` cannot change any measured result.

| Arm | Kind | Task | Needs a shell |
| --- | --- | --- | --- |
| `skill-control/` | **control** — blandness is a design constraint | repair | no |
| `purpose-check/` | treatment | repair | no |
| `oh-my-luna-skill/` | treatment | greenfield build | **yes** |

Every obligation in `oh-my-luna-skill/` traces to a defect measured in real
generated code (`research/failure-mode-taxonomy.md`), and each is **executed
rather than considered** — time a workload at two sizes, break a check and
confirm it fails. Under `tools: []` the model can only claim to have done that,
which is the failure it targets one level up, so it must not be used in Gate H
Stage A. None has ever been delivered to a model.

## v0.3.0 — long context, measured before it is fixed

The premise: Luna's window is very large, but quality falls as the context
fills. That is an assertion, so the order is instrument first.

```sh
npm run probe:context      # controls, then measurement, then mechanism
```

`src/probes/context-degradation.ts` places an unguessable needle at a controlled
depth in filler and scores recall across a **size × depth** grid, so a capacity
failure (`degrades_with_size`) is separable from a positional one
(`degrades_in_middle`) — different defects needing different fixes, which a
size-only measurement reports identically as "generally worse". Distractors are
a third axis, because confusion with near-identical filler is a different cause
from distance.

The controls ship inside the module. `runSelfCheck()` classifies five known
responders, and `npm run probe:context` **exits 1 without printing any
measurement** if they do not separate — the growth probe's lesson applied before
rather than after.

`src/context/compile.ts` is the mechanism the measured shape selects. It fits
scored documents to a token budget under a position policy and returns a
manifest of what was dropped and why. Its load-bearing property: **changing the
policy changes ordering and nothing else**, so a policy A/B varies position with
content held constant. `recommendPolicy` returns "change nothing" whenever the
measurement does not support moving anything.

`src/probes/policy-ab.ts` then checks the recommendation was right, which nothing
did before. Against a responder with a **known** mid-context blind spot, over 20
documents, `edge_loaded` reaches rank 6 where `as_ranked` reaches rank 3 — and
every policy recalls the same *number* of ranks, because the count of edge slots
belongs to the context, not the policy. What differs is who spends them:
"most relevant first" also means "least relevant last, at the other edge", so
`as_ranked` gives three of its six edge slots to the three least relevant
documents in the corpus. Beyond rank 6 no reordering helps, and the probe says
so rather than reporting a smaller effect.

Not claimed: that any real model has this weakness — the responder above is
synthetic, its blind spot defined rather than discovered — or that Luna degrades
at all. Both need live calls this repository has never made.
`docs/context-v030.md`.

## Protocol v2 — implemented, gated, not frozen

Steps 1–6 of the repair plan are done: source in every arm, four blocking
sufficiency gates, an output cap set from measurement, base-vs-returned diff
metadata, timeout distinguished from test failure, and a fifth `unseen` stub as
the regression test for the original defect.

```sh
npm run heldout:sufficiency        # v1  -> 3 of 4 gates FAIL, exit 6
npm run heldout:sufficiency-v2     # v2  -> 4 of 4 PASS,     exit 0
npm run heldout:v2:stubs           # asserts all five stub outcomes
```

`npm run heldout:v2:stubs` is the strongest offline evidence available: the
`noop` stub reconstructs each base file **from the prompt alone** and must
produce zero diff hunks on all twenty cells, so it passes only if the v2 prompt
round-trips every corpus file byte-exactly.

The v2 runner **refuses to execute live** (exit 21). Two decisions are the
owner's and are open — the skill-control arm (plan §5) and whether
`evaluator_exit === 0` is an adequate outcome measure (plan §8). Freezing before
they are settled would convert them into author discretion after the fact, which
is the failure the whole protocol exists to prevent.

## Open question — the success criterion may not express the weakness (2026-08-03)

Raised by the `Luna-example/` sample, not by a run. Analysis:
`research/luna-example-framevault-ab.md`; plan section:
`docs/gate-h-heldout-v2-plan.md` §8.

Two implementations of one greenfield spec. The arm stated to have used the skill
shipped a quadratic denial-of-service reachable from untrusted input — with every
declared length legal, so the spec's literal anti-allocation requirement is met
and its purpose defeated — plus a `typecheck` script that performs no type
checking and exits 0 by construction. Both defects pass every test their author
wrote, so under `evaluator_exit === 0` they score as clean work.

That is a third confound, after the missing source and the missing
base-vs-returned diff. Unlike those, it lives in the **outcome measure**, so
adding source to the prompt does not touch it. It needs an owner decision before
v2 freezes; three options with their costs are in §8.

Two limits on that, stated because the loose version overstates it: the evaluator
injects whole test files rather than single tests, so same-file collateral damage
*is* caught; and the sample is n=1 per arm with no recorded model identity,
effort, or transcript, so it identifies a **possible** blind spot, not a
demonstrated one.

See `research/repository-truth-audit.md`, `research/architecture-reset.md`, and
`docs/evaluation-plan-v3.md` before treating any component as core. Original
Gate A–C architecture documents are retained as superseded history.

## Gate C quick start

```sh
npm ci
npm run typecheck
npm test
npm run smoke
npm run gate-m:setup      # provision, then validate
```

`gate-m:validate` on its own fails with `stale worktree commit` on a fresh
checkout: it reads worktrees that `gate-m:provision` materializes, and
`.gate-m-cache/` is gitignored. `gate-m:setup` runs both in order.

Held-out pipeline (offline, $0.00; needs Node 22/24, Python 3.11+ with `pytest`,
git and ~2 GB disk):

```sh
npm run heldout:provision      # clones 4 upstream repos, verifies pinned commits
npm run heldout:verify         # checked=43 mismatched=0 aggregate=match document=match
npm run heldout:sufficiency    # v1: 3 of 4 gates fail, exit 6 — this is correct
npm run heldout:sufficiency-v2 # v2 candidate: 4 of 4 pass
npm run heldout:v2:stubs       # all five stub expectations
```

The included smoke adapter is a deterministic test double. A passing configured
verifier does not mean user claims or terminal evidence were verified. See
`docs/harness.md`.
