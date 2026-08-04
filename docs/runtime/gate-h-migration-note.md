# Gate H migration note — why the runtime belongs before v2

How the runtime control boundary relates to the Gate H held-out corpus and its
v1→v2 migration, and why it must land **before** the v2 freeze.

## The v1 defect that motivated the sufficiency boundary

Gate H held-out v1 froze a protocol with a **prompt-insufficiency defect**
(`research/gate-h-heldout/DEFECT-2026-08-03-unseen-source.md`). The system
prompt required the model to reproduce complete file contents, but the prompt
sent to the model never contained those files — only metadata *about* them (path,
line ranges, symbol names). The model had no read tool and `store:false`, so it
could not retrieve the source. All four arms would have failed for a harness
reason, and the flat result would have been indistinguishable from a true null.

The defect was found at $0.00 before the first live call, by **reading the
prompt-assembly code against the system prompt**, not by running it. It survived
ten freeze integrity checks, a leakage audit, four stubs, and a runbook —
because all of those verify **integrity** (inputs are the intended bytes,
mutation is detected), not **sufficiency** (the intended bytes are adequate to
the task posed).

The v1 defect is mechanical and offline-detectable:
`scripts/gate-h-heldout/check-prompt-completeness.mjs` checks whether a
distinctive interior line of each required file appears in the rendered prompt.
Expected exit: `6` (source absent). **Not yet executed** — the shell classifier
was down this session — but written, reviewed, and owed.

## The runtime's sufficiency boundary

The **sufficiency** surface (`src/runtime/readiness.ts:76-134`) is the runtime's
answer to that class of defect. It checks:

1. **`required_paths_provided`** — every path the task requires is in the set of
   paths the model received.
2. **`provided_paths_readable`** — every provided path is actually readable by
   the execution path (a reference to an inaccessible file is not sufficiency).
3. **`unsatisfiable_without_tools`** — named needs the task cannot meet with what
   it was given (e.g. a network fetch when no tool provides one). Non-empty means
   the prompt is insufficient as posed.

A green sufficiency check does **not** imply prompt quality, task solvability,
or that the answer is derivable — those are out of scope. But it catches the v1
class: asking the model to reproduce a file's contents while not providing that
file's contents.

The check is offline, free, deterministic, and returns a typed `ReadinessResult`
with an explicit `implies_not` list so a green never overstates what it
establishes.

## Why the runtime must land before Gate H v2

The v2 plan (`docs/gate-h-heldout-v2-plan.md`) repairs the defect by including
the full current contents of every `permitted_paths` file at the base commit in
all arms. That makes the **prompt** sufficient. But it does not verify that
sufficiency — the v2 freeze could ship the same defect in a different form (e.g.
a script bug that reads from the wrong commit, or an off-by-one that truncates
the last file).

**If v2 freezes first, then the runtime lands:**

- The sufficiency check is **not** in the freeze, so it cannot prevent a
  v2-equivalent defect before the freeze.
- Adding it after the freeze requires **another re-freeze** (v3), because the
  check must be bound and hash-verified alongside the protocol it validates — a
  check added post-freeze has no freeze-time guarantee.
- Running v2 before the runtime would mean spending $0.53–$0.80 on a protocol
  that has no mechanical sufficiency guard, after the project explicitly decided
  that such a guard is necessary.

**If the runtime lands first, then v2 freezes:**

- `sufficiency` is available before the v2 freeze.
- The v2 `RUNBOOK` adds a sufficiency check alongside the existing integrity
  checks: "If `check-prompt-completeness.mjs` does not exit 0, stop; the prompt
  is insufficient."
- The sufficiency script and its expected-zero-exit requirement are frozen into
  v2 (`freeze/identity.json`) and hash-verified. A later prompt change that
  reintroduces the defect fails the freeze check.
- v2 ships with the guard it was designed to need.

The second path is cheaper (one freeze, not two), safer (the guard exists before
dollars are spent), and aligned with the project's own conclusion after finding
the defect.

## What the runtime does NOT provide for Gate H

- The runtime is **not** an agent scaffold or orchestrator. Gate H v2 does not
  need one; it is a single-call per-attempt protocol with no model-facing
  iteration.
- It does **not** register any semantic capability. The manifest schema exists,
  but the registry is empty until an oracle-ladder result justifies an entry.
- It does **not** measure non-functional properties. Gate H's success criterion
  is `evaluator_exit === 0`; the runtime's evidence and claim machinery can
  re-derive that verdict from persisted semantics, but it cannot express
  asymptotic cost or adversarial behaviour — defects outside the evaluator's
  test-file coverage remain outside this boundary.

## What lands in v2 if the runtime is first

Three additions to the v2 freeze, each offline and free:

1. **`check-prompt-completeness.mjs`** as a required pre-flight gate (exit 0 or
   abort). **Landed 2026-08-04**, and wider than proposed here: it is one of four
   gates in `scripts/gate-h-heldout/check-sufficiency.mjs`, alongside
   `output_cap_headroom`, `template_claim_audit` and `stub_realism`. The v2
   runner aborts with exit 31 if any gate fails. Frozen v1 fails three of the
   four; the v2 candidate passes all four.
2. **`readiness.sufficiency`** check in the runbook, with frozen `required_paths`
   and `provided_paths` lists per task.
3. **State and evidence capture** at evaluation time (optional; does not block
   the run). A finalized run under `.oml/runs/<runId>/` persists the evidence
   bound to the workspace tree, so `verify-run` can later confirm a green against
   the current tree. This is the anti-false-green path demonstrated in
   `tests/runtime-run-store.test.ts:79-89`.

None of these changes the model-facing prompt, the evaluator, or the
continuation rule. They wrap the v2 protocol with the checks the v1 postmortem
identified as missing.

## Sequencing: runtime → v2 freeze → execute

1. **Runtime merges** (this deliverable: branch `research/runtime-foundation` →
   PR → main). Offline, $0.00, no credential, adds the boundary machinery without
   altering existing protocols.
2. **v2 freeze** incorporates the sufficiency check and the fixed prompt (source
   included). Offline, $0.00.
3. **Credential + budget** supplied. Not on the critical path until steps 1–2
   finish.
4. **Execute v2** with the guard in place.

If the credential arrives before the runtime, hold it until the runtime merges
and the v2 freeze incorporates sufficiency. Running a protocol that costs money
without the free guard it was designed to need wastes the learning from the v1
defect.

## Validation status

Gate H claims: **verified by source inspection** of
`research/gate-h-heldout/DEFECT-2026-08-03-unseen-source.md`,
`research/gate-h-heldout/STATUS.md`, `docs/gate-h-heldout-v2-plan.md`. The
sufficiency surface: **verified by source inspection** of
`src/runtime/readiness.ts:76-134` and `tests/runtime-readiness.test.ts:43-68`.
Execution of both the Gate H check script and the runtime tests is **owed**
(classifier down).