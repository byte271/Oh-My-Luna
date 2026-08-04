# Runtime foundation — final report

The consolidated result of the runtime-foundation mission: determine, design, and
implement the smallest justified runtime foundation for `byte271/Oh-My-Luna`, with
every claim classified by evidence level.

## Classification legend

- **[verified-by-execution]** — a command ran and its output matched expectation.
- **[verified-by-source-inspection]** — the code/artifact was read directly; it
  reads correct, imports resolve to real exports, types align.
- **[inferred]** — follows from verified premises but was not directly observed.
- **[untested]** — written but not exercised by a run.
- **[blocked]** — cannot execute this session (shell classifier intermittent, no
  credential, or external dependency).
- **[unattested]** — explicitly out of scope; not measured and not claimed.

## What was decided

**[verified-by-source-inspection]** ADR 0017 (`docs/adr/0017-runtime-control-boundary.md`)
decides **Option 4 — a minimal runtime control layer**, narrowly scoped, absorbing
Option 7's deferrals. It falsifies Options 1–3, 5, and 6 in writing. The decisive
reasons:

- Option 5 (full Codex-style orchestration) was rejected because OMX's own
  completion gate *"primarily validates record fields and locators; this is not the
  same as verifying the linked artifact's behavior or freshness"*
  (`research/prior-art.md:44-46`) — the exact false-green class this work exists to
  prevent. **[verified-by-source-inspection]** against the immutable npm 0.20.3
  tarball (SHA-1 `789d149ca5d01fa32114904a85e4c99af3c04afb`).
- An orchestration layer would confound every future Luna measurement with
  orchestration effects, disqualifying for a causal project. **[inferred]** from the
  project's stated purpose.

## What was built

**[verified-by-source-inspection]** for every item; **[blocked]** on execution.

| Component | File | What it enforces |
|-----------|------|------------------|
| Boundary vocabulary | `src/runtime/types.ts` | Typed policy/evidence/claim shapes |
| Admissibility seam | `src/runtime/broker.ts` | Executable allowlist, argv policy, env-subset, write scoping, budgets |
| Evidence VM | `src/runtime/evidence.ts` | Semantic capture, fine-grained claim status, tree-hash freshness |
| Lifecycle + I/O | `src/runtime/state.ts` | State machine, atomic writes, hash-checked reads |
| Durable store | `src/runtime/run-store.ts` | `.oml/` persistence, inspect, **re-derivation** |
| Readiness triad | `src/runtime/readiness.ts` | doctor / smoke / sufficiency, each with `implies_not` |
| CLI | `src/runtime-cli.ts` | Offline surfaces, stable exit codes |

The boundary **reuses** the existing hard parts rather than reimplementing them:
`applyProposedFiles` (path/symlink rejection), `runProcess` (shell-free bounded
spawn), `scoring.ts` (blind verification). **[verified-by-source-inspection]** —
`broker.ts:178,198` delegate to these; the broker only adds admissibility and
budget on top.

## How each mandatory principle is satisfied

1. **Prompts are policy hints, not security controls.** **[verified-by-source-inspection]**
   No enforcement path reads a prompt; the broker decides on typed policy only.
2. **Hooks are not the security boundary.** **[verified-by-source-inspection]** The
   seam is the broker (`broker.ts`), reachable only through its methods; the threat
   model states hooks are observation/mechanical-enforcement only.
3. **Deterministic broker decides admissibility; no "sandbox" claim.**
   **[verified-by-source-inspection]** The docs use "runtime-controlled host
   execution" and "copy isolation without containment"; the word "sandbox" is used
   only when explicitly denying containment.
4. **Capability-based, no global `safe:true`.** **[verified-by-source-inspection]**
   No `safe` flag exists; `validatePolicy` (`broker.ts:36-60`) requires per-field
   disclosure. The capability manifest schema is defined; the **registry is empty**.
5. **doctor / smoke / sufficiency separated.** **[verified-by-source-inspection]**
   Three functions, three `implies_not` lists (`readiness.ts`). A green doctor
   disclaims provider auth, model call, solvability, prompt sufficiency, verifier
   validity, and OS sandbox — **[verified-by-source-inspection]** at
   `readiness.ts:65-72` and asserted in `runtime-readiness.test.ts:22-24`
   (**[untested]** until the suite runs).
6. **Evidence describes semantics, not command names.** **[verified-by-source-inspection]**
   `EvidenceRecord` captures argv, resolved executable, cwd, env names, exit,
   digests, duration, tree hash, files (`evidence.ts:77-96`). Adversarial
   false-green tests exist (`runtime-evidence.test.ts`).
7. **Claims require explicit evidence dependencies; never one Boolean.**
   **[verified-by-source-inspection]** `evaluateClaim` returns
   unsupported/stale/ambiguous/failed/supported in a fixed order
   (`evidence.ts:125-203`).
8. **Resource budgets enforced; the rest disclosed.** **[verified-by-source-inspection]**
   Six budgets each with a dedicated `OML_*` code; `validatePolicy` rejects a
   policy that omits any of cpu/memory/disk/network/syscalls/process_tree from
   `unattested` (`broker.ts:40-48`). Those six are **[unattested]** by construction.
9. **Auditable, recoverable `.oml/` state.** **[verified-by-source-inspection]**
   Atomic temp+rename, schema-version + content-hash checks, terminal states
   (`state.ts`). Tamper-**evident**, not tamper-proof — stated in code and docs.
10. **Scientific attribution preserved.** **[verified-by-source-inspection]**
    Capability semantics are separately versioned (`version` semver, `promotion_status`);
    no capability is registered, so nothing is yet ablation-attributable as a result
    — the property is by design, not yet demonstrated. **[inferred]**.

## Adversarial test coverage across the six required classes

**[verified-by-source-inspection]** the tests exist and measure behavior (a real
write or spawn), not the mere existence of a limit. **[untested]** / **[blocked]**
on the actual run.

| Class | Suite | Representative measured behavior |
|-------|-------|----------------------------------|
| Path/filesystem | `runtime-broker.test.ts` | absolute/traversal path, `write_paths` scope, symlinked parent → `OML_SYMLINK_REJECTED` |
| Process | `runtime-broker.test.ts` | executable allowlist, argv policy, env-subset, cwd escape |
| Evidence integrity | `runtime-evidence.test.ts` | verifier-exit-only → unsupported under strong; stale tree; timeout+exit0 → ambiguous; **symlink swap changes tree hash** |
| Prompt/context sufficiency | `runtime-readiness.test.ts` | missing required path fails; unsatisfiable-without-tools flagged; disclaimers present |
| State/recovery | `runtime-state.test.ts`, `runtime-run-store.test.ts` | illegal transition, torn JSON, hash mismatch; a supported claim re-derives **stale** after mutation |
| Resource | `runtime-broker.test.ts` | wall-clock kill, output cap, command/retry/file/write-byte budgets |

## One defect found and fixed during self-verification

**[verified-by-source-inspection]** During an independent re-inspection pass over
my own deliverable, `hashWorkspaceTree` was found to record symlinks as only
`symlink:target-exists|dangling`, dropping the link's target. The code comment and
two docs claimed "a symlink swap changes the tree hash" — **false** for a swap
between two existing targets. That is the false-green class, in the artifact meant
to prevent it, and no test pinned the behavior.

**Fix applied** (`evidence.ts:39-48`): records
`symlink:<exists|dangling>:<readlink-target>`, making the claim true; added an
adversarial swap test (`runtime-evidence.test.ts`, the "re-pointed between existing
targets" case) that would have caught it; corrected the code comment and both docs.
This is the only defect found; every other claim survived re-inspection.

## Gate H relevance

**[verified-by-source-inspection]** The `sufficiency` surface answers the Gate H
held-out **v1 defect** — the prompt required the model to reproduce source it was
never shown (`research/gate-h-heldout/DEFECT-2026-08-03-unseen-source.md`). The
runtime should land **before** the v2 freeze so the sufficiency check can be frozen
and hash-verified alongside the repaired protocol, rather than requiring a third
freeze later. Full reasoning: `docs/runtime/gate-h-migration-note.md`.

## What this runtime is NOT — required disclaimers

**[verified-by-source-inspection]** across the doc set:

- It is **not an intelligence amplifier** and **does not make Luna smarter.** It
  measures and constrains; it does not improve model capability. Any such claim is
  forbidden (identity.json:356-364).
- It is **not a sandbox.** There is no OS-level containment: cpu, memory, disk,
  network, syscalls, and process-tree are **[unattested]**. A permitted process can
  spin, allocate, open sockets, or fork; the boundary does not stop it.
- It is **not a multi-agent framework, Codex clone, prompt library, persona
  collection, or learned scaffold.** No orchestration, no registered capability, no
  model-facing roles.
- Its state is **tamper-evident, not tamper-proof.** An attacker who rewrites both
  a body and its recorded hash defeats detection.
- No capability semantics are **independently validated.** The manifest schema
  exists; the registry is empty.

## Execution status — the honest ledger

- **[verified-by-execution]** File line counts (`wc -l`, the one command that ran
  in a brief classifier window): runtime source + tests ≈ 1,899 lines, docs ≈ 1,167.
- **[blocked]** `npm run build` / `npm test` — the shell safety classifier was
  intermittently unavailable this session; two build/test attempts were refused.
  Consequently every [tested]/[enforced] tag is **written-but-unexecuted**. A single
  successful `npm test` converts the entire "Adversarial test coverage" table from
  **[untested]** to **[verified-by-execution]**.
- **[blocked]** Branch `research/runtime-foundation`, commit, push, draft PR — all
  require the shell. Exact commands are in `docs/runtime/status-report.md`.
- **[blocked]** Fresh live OMX GitHub retrieval (WebFetch gated); the immutable npm
  tarball was used instead, which is stronger provenance.
- **[blocked]** `npm run heldout:check-prompt` (Gate H sufficiency script, expected
  exit 6), FrameVault suites — all shell-gated.

## Cost and safety ledger

- **Spent:** $0.00
- **Live model calls:** 0
- **Credentials used or written:** none
- **Approval/budget env vars set:** none
- **Main branch modified:** no (all work staged for a feature branch)
- **Frozen experiments altered:** none

Every operation in this deliverable is deterministic, offline, and
model-independent.

## Bottom line

The smallest justified runtime foundation is a **deterministic control boundary
over existing primitives** — not a new framework. It is **[verified-by-source-inspection]**
complete: a broker seam, evidence semantics with re-derivation, tamper-evident
durable state, and a readiness triad that refuses to let one green imply another.
The one false-green found (in the tree hash) was in this deliverable itself and is
fixed. What remains is **[blocked]**, not undone: build, test, branch, and PR, each
with an exact command recorded, waiting only on the shell classifier and — for the
PR — GitHub auth. Nothing here claims to make the model better; it exists to make a
claimed success checkable.