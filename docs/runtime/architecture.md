# Runtime control boundary — architecture

The deterministic control layer decided in
[ADR 0017](../adr/0017-runtime-control-boundary.md), as built. This describes the
seam, the modules, and the data flow. Everything here is offline, deterministic,
and model-independent; nothing here makes a model call or requires a credential.

## One seam

Every privileged action a run performs — apply a file, run a process, record
evidence, advance lifecycle state — crosses a runtime-owned interface. The seam
exists so a check cannot be skipped by a code path that simply forgets to call it:
the privileged operation is *only reachable* through the broker.

```
        Luna output / fixture (untrusted data)
                     │
                     ▼
            ┌──────────────────┐
            │      Broker      │  admissibility + budget (deterministic)
            │  src/runtime/    │
            │   broker.ts      │
            └───────┬──────────┘
        admit │ deny (OML_* code)
              ▼
   ┌──────────────────────┐        ┌────────────────────────┐
   │ environment.ts       │        │ process.ts             │
   │ applyProposedFiles   │        │ runProcess             │
   │ (path/symlink policy)│        │ (shell-free, timeout,  │
   │                      │        │  output cap, env allow)│
   └───────┬──────────────┘        └───────────┬────────────┘
           │ files changed                     │ ProcessResult
           ▼                                   ▼
        ┌───────────────────────────────────────────┐
        │ EvidenceVM  (src/runtime/evidence.ts)      │
        │ captures SEMANTICS; evaluates CLAIMS       │
        └───────────────────┬───────────────────────┘
                            │ EvidenceRecord[], ClaimEvaluation[]
                            ▼
        ┌───────────────────────────────────────────┐
        │ RunStore + state.ts  (durable .oml/ state) │
        │ atomic, versioned, hash-checked            │
        └───────────────────┬───────────────────────┘
                            │
             inspect-run ◄──┴──► verify-run  (re-derive vs current tree)
```

## Modules

- **`src/runtime/types.ts`** — the boundary vocabulary. `ExecutionPolicy`,
  `ExecutableRule`, `ArgvPolicy`, `ResourceBudget` (with an `unattested` list),
  broker request/decision types, `EvidenceType`, `EvidenceRecord`, the fine-grained
  `ClaimStatus`, `Claim`, `ClaimEvaluation`. No behavior.
- **`src/runtime/broker.ts`** — the seam. `validatePolicy` (workspace root must be
  absolute; every unattested resource must be disclosed; regexes must compile).
  `Broker` holds one run's mutable budget ledger and exposes `decide`, `applyWrite`,
  `exec`, `chargeRetry`. It **reuses** `applyProposedFiles` and `runProcess`; it
  never re-implements or bypasses their enforcement, it only adds admissibility
  (executable allowlist, argument policy, env-subset, write-path scoping) and
  budget accounting on top.
- **`src/runtime/evidence.ts`** — the Evidence VM. `hashWorkspaceTree` (a
  deterministic, content-sensitive tree hash; symlinks recorded by their own
  readlink target, not followed, so a re-point changes the hash). `EvidenceVM.capture` (append-only, records exact command semantics and
  digests). `EvidenceVM.evaluateClaim` (returns a fine-grained `ClaimStatus`, never
  a Boolean). `rollUp` (maps fine statuses onto the receipt's coarse vocabulary
  without discarding the detail). `restore` (rehydrate persisted records for
  re-verification).
- **`src/runtime/state.ts`** — durable lifecycle state. `RunState` machine and
  `assertTransition`; `writeStateFile`/`readStateFile` (atomic temp+rename;
  schema-version + content-hash checks); `statePath`.
- **`src/runtime/run-store.ts`** — the `.oml/runs/<runId>/` store. Persists manifest,
  evidence, claims, evaluations. `inspectRun` reads them back faithfully;
  `reverifyRun` re-derives every claim against the **current** workspace tree.
- **`src/runtime/readiness.ts`** — the readiness triad: `doctor`, `smoke`,
  `sufficiency`, each returning an `implies_not` disclosure list.
- **`src/runtime-cli.ts`** — the offline CLI over the surfaces above.

## Data flow for one action

1. A caller constructs an `ExecutionPolicy` and a `Broker`. `validatePolicy` runs in
   the constructor; an invalid policy throws before any action is possible.
2. For a write: `broker.applyWrite` checks path shape, workspace containment,
   `write_paths` scoping, and the file/byte budgets, then delegates the actual
   write (with realpath/symlink enforcement) to `applyProposedFiles`, then commits
   the budget.
3. For an exec: `broker.exec` checks the executable allowlist, argument policy,
   env-subset, command budget, and `cwd` containment, then delegates to
   `runProcess` with the policy's timeout, output cap, and env allowlist.
4. The caller records what happened via `EvidenceVM.capture`, binding the evidence
   to the workspace tree hash at that moment.
5. Claims are evaluated with `evaluateClaim` against the current tree hash.
6. `RunStore` persists manifest + evidence + claims + evaluations under `.oml/`.
7. Later, `verify-run` reloads and **re-derives** — a cached green cannot survive a
   tree change, because the verdict is recomputed from evidence every time.

## Why reuse, not replace

`environment.ts`, `process.ts`, and `scoring.ts` already implement the hard parts
(path/symlink rejection, shell-free bounded spawn, blind scoring). The boundary's
value is the *contract* over them — a single admissibility seam, evidence
semantics, a readiness triad, and durable re-derivable state — not a rewrite. The
adversarial suite asserts the seam adds enforcement the three modules did not
already provide (executable allowlist, argument policy, env-subset, budgets,
evidence typing, re-verification); ADR 0017's reversal condition fires if it does
not.

## Validation status

All module and behavior claims above are **verified by source inspection** of the
files named. Execution (`tsc` build + `node --test`) is **owed**: the safety
classifier gating the shell was unavailable for the whole implementation session,
so no build or test run has executed. The adversarial suite that would confirm the
[tested] tags in the threat model is written but not yet run.

> **Discharged 2026-08-04.** `npm run typecheck` and `npm test` both run clean:
> 218 tests, 218 pass, 0 fail — including the five runtime suites. The [tested]
> tags in the threat model are now verified by execution rather than by
> inspection. The symlink-creation tests skip rather than pass on hosts without
> symlink privilege; on this host they ran.