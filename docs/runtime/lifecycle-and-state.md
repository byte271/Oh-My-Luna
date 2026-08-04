# Run lifecycle and durable state

The run lifecycle state machine and the durable `.oml/` store. Mandatory principle
9: state is auditable and recoverable, writes are atomic, corruption is a hard
error, and the whole thing is tamper-*evident* — not tamper-*proof*. Behavior:
`src/runtime/state.ts` and `src/runtime/run-store.ts`.

## The lifecycle state machine

```
created ─▶ policy_admitted ─▶ executing ─▶ evidence_captured ─▶ claims_evaluated ─▶ finalized
   │             │               │                │                    │
   └─────────────┴───────────────┴────────────────┴────────────────────┴──────▶ aborted
```

`RunState` = `created | policy_admitted | executing | evidence_captured |
claims_evaluated | finalized | aborted`. `finalized` and `aborted` are **terminal**.

`assertTransition(from, to)`:

- A transition out of a terminal state raises `OML_STATE_ALREADY_TERMINAL`. A
  finalized run cannot be re-finalized or re-opened.
- A transition not in the declared table raises `OML_STATE_TRANSITION_INVALID`
  (e.g. `created → executing`, skipping policy admission).
- `aborted` is reachable from every non-terminal state — a run can always be
  abandoned, but never resurrected.

The machine is small on purpose: each edge corresponds to a checkpoint where the
store gains a new artifact (policy, evidence, evaluations), so the on-disk state is
always interpretable.

## Durable state files

State lives under `.oml/runs/<runId>/` (path via `statePath`). Files, each written
through the same atomic, hash-checked envelope:

| File | Content |
|------|---------|
| `manifest.json` | `{ run_id, workspace_root, finalize_tree_sha256, state }` |
| `evidence.json` | `{ records: EvidenceRecord[] }` |
| `claims.json` | `{ claims: Claim[] }` |
| `evaluations.json` | `{ evaluations: ClaimEvaluation[] }` (finalize-time) |

## The write/read contract

`writeStateFile(path, body)`:

1. Canonicalize the body (stable key order via `canonicalJson`).
2. Wrap in an envelope `{ schema_version, content_sha256, body }`.
3. Write to a temp path, then `rename` into place. A crash between write and rename
   leaves the temp file, **never a torn target** — the reader never sees a
   half-written state file.

`readStateFile(path)` refuses to best-effort parse:

- Not valid JSON ⇒ `OML_STATE_PARTIAL_WRITE` (truncation detected).
- `schema_version` unknown ⇒ `OML_STATE_SCHEMA_UNKNOWN` (no silent version drift).
- Recomputed body hash ≠ stored `content_sha256` ⇒ `OML_STATE_PARTIAL_WRITE`
  (truncation or post-hoc mutation detected).

All three are covered in `tests/runtime-state.test.ts`.

## Tamper-evident, not tamper-proof

The per-record content hash and the existing `trace.ts` hash chain make a mutation
*detectable*. They do **not** make it *impossible*:

- The files live on the same filesystem as everything else and are not externally
  anchored (no notary, no TPM, no remote log).
- An attacker who rewrites both a body **and** its recorded `content_sha256` (and,
  for the event log, re-links the chain) defeats detection.

This limitation is stated in code comments and in the
[threat model](threat-model.md) (T13). The word "tamper-proof" must never be used
for this store.

## Recovery and re-verification

Because every artifact is persisted and hash-checked, a run can be inspected or
re-verified long after it finished, on a different machine, with no live services:

- `inspectRun(root, runId)` reads the four files back faithfully, with **no
  re-derivation** — it reports exactly what was recorded.
- `reverifyRun(root, runId)` re-derives claim status against the current tree (see
  [evidence semantics](evidence-and-claim-semantics.md)). This is where recovery
  meets the anti-false-green property: a recovered run is re-judged, not trusted.

## Validation status

State-machine and file-contract behavior **verified by source inspection** of
`state.ts` and `run-store.ts`; the adversarial tests exist but are **not yet
executed** (classifier down — build/test owed).