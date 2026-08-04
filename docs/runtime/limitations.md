# Limitations of the runtime control boundary

What this layer does and does not guarantee, classified by evidence level. This
document is deliberately conservative: a limitation left unstated is a false-green
in the documentation itself. Every row carries one tag.

**Tag meanings**
- **[enforced]** — a code path denies the violating action with a specific `OML_*`
  error. Verified present by source inspection.
- **[tested]** — an adversarial test exercises the behavior. The test file exists;
  the run is **owed** (classifier down this session, so no `node --test` executed).
- **[observed]** — a property seen in real captured data (e.g. an in-repo hollow
  verifier), motivating a control.
- **[assumed]** — relied upon but not checked here; an explicit trust assumption.
- **[unattested]** — not measured, not bounded, not claimed. The honest gap.

## What IS enforced (and tested)

| Property | Tag | Mechanism / denial code |
|----------|-----|-------------------------|
| Writes stay inside `workspace_root` | [enforced][tested] | `applyProposedFiles` realpath check → `OML_PATH_ESCAPE` |
| Absolute / traversal write paths refused | [enforced][tested] | `OML_PATH_ESCAPE` |
| Writes scoped to `write_paths` when set | [enforced][tested] | `OML_PATH_NOT_WRITABLE` |
| Symlinked parent/target refused | [enforced][tested] | `OML_SYMLINK_REJECTED` |
| Only allowlisted executables run | [enforced][tested] | `OML_EXECUTABLE_NOT_PERMITTED` |
| Arguments constrained (any/exact/prefix/regex) | [enforced][tested] | `OML_ARG_REJECTED` |
| Env is a subset of an allowlist, by name | [enforced][tested] | `OML_ENV_NOT_ALLOWLISTED` |
| `cwd` contained in workspace | [enforced][tested] | `OML_PATH_ESCAPE` |
| Wall-clock deadline (SIGKILL) | [enforced][tested] | `OML_PROCESS_TIMEOUT` |
| Output byte cap | [enforced][tested] | `OML_PROCESS_OUTPUT_LIMIT` |
| Command / retry / file / write-byte budgets | [enforced][tested] | four dedicated `OML_*_BUDGET_EXCEEDED` codes |
| Policy must disclose all unattested resources | [enforced][tested] | `OML_POLICY_INVALID` |
| Evidence VM is append-only (no id reuse) | [enforced][tested] | `OML_INTERNAL` on duplicate |
| Claim status is fine-grained, never a Boolean | [enforced][tested] | `evaluateClaim` state ladder |
| Stale evidence cannot support a claim | [enforced][tested] | tree-hash mismatch → `stale` |
| State writes atomic; corruption is a hard error | [enforced][tested] | `OML_STATE_PARTIAL_WRITE` / `_SCHEMA_UNKNOWN` |
| Terminal run states are irreversible | [enforced][tested] | `OML_STATE_ALREADY_TERMINAL` |

The **[tested]** tag means the test is written, not that it has run. Until the
build/test execution owed below completes, treat every [tested] as
**[tested, not-yet-executed]**.

## What is assumed (explicit trust)

| Assumption | Tag | Why it is not checked here |
|------------|-----|----------------------------|
| The binary at a pinned path is the intended one | [assumed] | `resolved_path_sha256` hashes the path string, not the bytes. Byte-pinning not implemented. |
| The host OS enforces its own file permissions | [assumed] | This layer scopes paths logically; it does not set ACLs. |
| Node's `spawn` with `shell:false` does not invoke a shell | [assumed] | Relied upon by `process.ts`; a platform-level guarantee. |
| The reused primitives (`environment.ts`, `process.ts`) are correct | [assumed] | Their own tests predate this work; the boundary trusts, does not re-verify, them. |
| Git and the filesystem report true content | [assumed] | Tree hashing trusts the FS bytes it reads. |

## What is explicitly NOT attested

These are the honest gaps. The runtime makes **no claim** about any of them, and
`validatePolicy` forces each policy to say so out loud.

| Resource / property | Tag | Statement |
|---------------------|-----|-----------|
| CPU time / cores | [unattested] | Not limited. A permitted process may spin. |
| Memory (RSS/heap) | [unattested] | Not limited. A permitted process may exhaust RAM. |
| Disk space | [unattested] | Byte budget bounds *tracked writes*, not total disk use by a spawned process. |
| Network | [unattested] | Not blocked at the OS level. A permitted binary can open sockets. No capability *requires* network (schema pins `network:false`), but the layer does not *prevent* it. |
| Syscalls | [unattested] | No seccomp/syscall filter. This is **not a sandbox**. |
| Process tree / fork bombs | [unattested] | Child processes of a permitted process are not tracked or reaped as a group. |

Consequently the term **"sandbox" is never used** for this layer. ADR 0017 and the
architecture doc call it a *runtime-controlled host execution* boundary with *copy
isolation without containment*. The copy protects the original tree from edits; it
does **not** contain a process's system-level effects.

## What green surfaces do NOT imply

Restated from the readiness triad (`implies_not` lists are machine-readable, not
just prose):

- A green **doctor** does not imply provider auth works, a model call would succeed,
  the task is solvable, the prompt is sufficient, the verifier is valid, or an OS
  sandbox contains the process.
- A green **smoke** does not imply any of the above beyond "a permitted write and a
  permitted process executed once."
- A green **sufficiency** does not imply prompt *quality* beyond presence, task
  solvability, or that the answer is derivable — only that named inputs are present
  and readable.

## Scientific limitations (not security)

- The runtime **does not make Luna smarter** and is not an intelligence amplifier.
  It measures and constrains; it does not improve model capability. Any claim to the
  contrary is forbidden (identity.json:356-364).
- No capability is registered. The manifest *schema* exists; the registry is empty
  until an oracle-ladder result justifies an entry (principle 4, ADR 0002).
- Attribution is preserved by construction (separately versioned semantic
  components), but **no ablation has been run** — attributability is a property of
  the design, not yet an experimental result.

## Execution owed (this session's hard limit)

The safety classifier gating shell/Bash/WebFetch was unavailable for the entire
implementation session. Therefore:

- `tsc` **has not compiled** the new modules. Type-correctness is **verified by
  source inspection only**.
- `node --test` **has not run** the five adversarial suites. Every [tested] tag is
  **written-but-unexecuted**.
- No branch was created, no PR opened, no live OMX GitHub retrieval performed.

These are recorded in the [status report](status-report.md) with the exact commands
that must be run when the shell is available.