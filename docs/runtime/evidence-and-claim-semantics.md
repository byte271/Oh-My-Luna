# Evidence and claim semantics

How the runtime records *what happened* and decides *what that supports*. This is
the mechanism behind mandatory principles 6 and 7 and the central defense against
the false-green class. Types: `src/runtime/types.ts`; behavior:
`src/runtime/evidence.ts`.

The one-sentence thesis: **an exit code is not a proof, and a claim is never a
Boolean.** Everything below follows from that.

## Evidence records semantics, not labels

An `EvidenceRecord` captures the exact provenance of an action, not a command
*name*. Fields (all persisted):

- `evidence_id` — unique within a run; a duplicate is refused (append-only VM).
- `evidence_type` — one of `configured_verifier_exit`, `typed_observation`,
  `content_hash`, `process_result`. **`configured_verifier_exit` is the weakest.**
- `command` — `{ argv, resolved_executable, cwd, environment_names }`. Environment
  is recorded by **name only**, never value, so a secret can never enter evidence.
- `exit_status`, `timed_out`, `duration_ms`.
- `stdout_sha256`, `stderr_sha256` — digests, not raw output (bounded, and no
  secret leakage through captured text).
- `workspace_tree_sha256` — the tree hash *after* the action. This binds the
  evidence to a specific state of the world.
- `files_affected`, `captured_at`, `producer_capability_version`.

Why digests and tree hashes instead of raw text: so that "the verifier passed" can
be distinguished, after the fact, from "a script named `typecheck` exited 0
without type-checking." The record answers *what exactly ran, against what exact
tree, producing what exact output digest* — the questions a hollow verifier cannot
survive.

## The workspace tree hash

`hashWorkspaceTree(root)` produces a deterministic hash from the sorted list of
`(relative-path, content-hash)` pairs. Properties:

- **Content-sensitive.** Changing any file's bytes changes the tree hash.
- **Structure-sensitive.** Adding or removing a file changes it; removing the added
  file restores the original hash (verified in `runtime-evidence.test.ts`).
- **Symlinks by their own target.** A symlink is recorded as
  `symlink:<target-exists|dangling>:<readlink-target>`, **not followed**. Because
  the link's own target string is part of the hash, re-pointing the link — even
  between two targets that both exist — changes the tree hash rather than silently
  redirecting. (Covered by the symlink-swap case in `runtime-evidence.test.ts`.)

This hash is the anchor for staleness: evidence is bound to the tree it was taken
against.

## Claim evaluation — a finite state, never a Boolean

`evaluateClaim(claim, currentTreeSha256, { requireStrongEvidence })` returns a
`ClaimStatus`, decided in this order:

1. **`unsupported`** — the claim declares *no* evidence dependencies. Silence is not
   success. (Also `unsupported` if a referenced evidence id is missing.)
2. **`stale`** — some supporting evidence is bound to a tree hash other than the
   current one. The world moved since the evidence was taken.
3. **`ambiguous`** — evidence is internally contradictory (e.g. `timed_out` with a
   zero exit). A contradiction cannot support a claim.
4. **`failed`** — some dependency reports a nonzero exit or a timeout.
5. **`unsupported` (weak)** — the *only* evidence is `configured_verifier_exit` and
   the caller passed `requireStrongEvidence`. An exit code alone is not a proof.
6. **`supported`** — evidence exists, is fresh (current tree), non-contradictory,
   successful, and (if strong evidence was required) not purely a verifier exit.

The coarse receipt vocabulary (`not_evaluated` / `partially_evaluated` /
`evaluated`) is a **roll-up** via `rollUp`, retained alongside the fine per-claim
statuses — never a replacement for them. The receipt schema v0.3 already carries
separate `configured_verifier.status`, `claim_evaluation.status`, and
`terminal_evidence_status`, so this layer adds detail without breaking the receipt.

## Re-derivation, not caching (`verify-run`)

The finalize-time `ClaimEvaluation` is stored, but it is **not** trusted as a
cached verdict. `reverifyRun` (in `run-store.ts`) reloads the evidence, recomputes
the *current* tree hash, and re-runs `evaluateClaim` for every claim. Consequences:

- If the workspace changed after finalize, evidence bound to the old tree is now
  `stale`, so a claim that read `supported` at finalize reads `stale` now, and
  `verify-run` reports it as a regression and exits non-zero.
- With `--require-strong`, a claim resting only on a verifier exit re-derives as
  `unsupported`, even though the same claim (without the flag) is weakly supported.

Both behaviors are covered end-to-end in `tests/runtime-run-store.test.ts`. This is
the operational meaning of "a false green cannot persist": the verdict is a
function of current evidence, recomputed on demand, not a stored bit.

## What the runtime deliberately does NOT parse

`contradictory()` reasons only over structured signals it captured (exit status,
timeout, digests). It does **not** grep stdout for words like `PASSED`. Free-text
pattern-matching is intentionally excluded from the trust core: a fragile grep must
never become a trust anchor. A caller that wants text-based judgement supplies it
as a separate `typed_observation` evidence record, which is then subject to the
same freshness and contradiction rules — the parsing lives outside the VM, and its
result is just more evidence, not a privileged shortcut.

## Validation status

Semantics **verified by source inspection** of `src/runtime/evidence.ts`,
`types.ts`, and `run-store.ts`. The [tested] behaviors are written as adversarial
tests (`runtime-evidence.test.ts`, `runtime-run-store.test.ts`) but **not yet
executed** — the shell classifier was unavailable this session, so the build/test
run is owed.