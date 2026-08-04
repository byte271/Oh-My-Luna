# Oh-My-Luna

Oh-My-Luna is an experimental evaluation kernel for discovering whether a small,
model-specific external mechanism can improve GPT-5.6 Luna on repository tasks.

The repository does **not** yet contain a demonstrated intelligence amplifier.
It has no live Luna result, trained specialist, real provider adapter, or
attested sandbox. Its implemented value is controlled execution, scoring,
tracing, and negative safety checks. Context compilation, capability
composition, and learned guidance remain hypotheses until causal intervention
tests identify Luna's actual bottleneck.

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

## Known blocking defect (2026-08-03)

`gate-h-heldout-v1` must not be run live. The Stage A prompt does not contain the
source the model is required to reproduce, and the transport sends `tools: []`, so
every arm would fail for a harness reason. The resulting flat row of failures is
indistinguishable from a genuine negative finding about oracle information.

The offline dry run does **not** catch this — it reports 20/20, because the stubs
read the file from disk and so hold exactly what the real model lacks.

- Defect: `research/gate-h-heldout/DEFECT-2026-08-03-unseen-source.md`
- Repair plan: `docs/gate-h-heldout-v2-plan.md`
- Sequencing decision: `docs/adr/0016-prompt-sufficiency-before-effort-axis.md`
- Detector: `npm run heldout:check-prompt`
- Full review: `docs/status-2026-08-03.md`

The critical path is offline and costs nothing. The absent API credential is a
second, non-binding blocker: supplying one now would only make a defective run
possible.

The general lesson, recorded because it generalizes past this bug: every existing
check verifies **integrity** — that inputs are the intended bytes and that
mutation is detected. None verified **sufficiency** — that the intended bytes are
adequate to the task posed. A 43-artifact freeze, a 10-check kernel gate, a
leakage audit and four stubs all passed over a prompt missing its source.

See `research/repository-truth-audit.md`, `research/architecture-reset.md`, and
`docs/evaluation-plan-v3.md` before treating any component as core. Original
Gate A–C architecture documents are retained as superseded history.

## Gate C quick start

```sh
npm ci
npm run typecheck
npm test
npm run smoke
npm run gate-m:validate
```

The included smoke adapter is a deterministic test double. A passing configured
verifier does not mean user claims or terminal evidence were verified. See
`docs/harness.md`.
