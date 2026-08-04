# Capability & execution-policy schema reference

Reference for the machine-readable policy that governs one run, and the capability
manifest schema that will later register deterministic capabilities. Types live in
`src/runtime/types.ts`; the JSON Schema lives in
`schemas/capability-policy.schema.json`. This document is normative for field
meanings; where the two disagree, the schema wins and this doc is a bug.

Per [ADR 0017](../adr/0017-runtime-control-boundary.md) and ADR 0002, the manifest
*schema* is defined now, but **no semantic capability is registered** until an
oracle-ladder result justifies it. Registering a capability is a scientific act,
not a convenience.

## ExecutionPolicy

The per-run admissibility envelope. Constructed by the caller, validated by
`validatePolicy` in the `Broker` constructor.

| Field | Type | Meaning |
|-------|------|---------|
| `workspace_root` | absolute path | The only tree writes and `cwd` may resolve inside. **Must be absolute** or the policy is `OML_POLICY_INVALID`. |
| `read_paths` | string[] | Advisory list of paths the run expects to read. Not an enforcement boundary in this layer (the copy environment already scopes reads); recorded for auditing. |
| `write_paths` | string[] | If non-empty, writes must fall within one of these workspace-relative prefixes, **in addition** to being inside `workspace_root`. Empty ⇒ the whole workspace is writable. |
| `symlink_policy` | `"reject"` \| `"reject_crossing_root"` | Declares the symlink stance. The reused `applyProposedFiles` rejects symlinked parents/targets regardless; this field documents intent. |
| `permitted_executables` | `ExecutableRule[]` | The allowlist. An `exec` whose `argv[0]` matches no rule is `OML_EXECUTABLE_NOT_PERMITTED`. |
| `environment_allowlist` | string[] | Names (never values) of env vars a process may receive, on top of the always-safe base set in `process.ts`. A run may request a **subset**, never a superset. |
| `limits` | `ResourceBudget` | The enforceable budgets plus the unattested disclosure. |

## ExecutableRule

| Field | Type | Meaning |
|-------|------|---------|
| `id` | string | Matched against `argv[0]` exactly. Typically an absolute executable path. |
| `resolved_path_sha256` | string \| null | Optional pin: SHA-256 of the resolved executable **path string** (not the binary bytes — see the note below). `null` = unpinned. |
| `argv_policy` | `ArgvPolicy` | How arguments are constrained. |

### ArgvPolicy modes

- `any` — any arguments permitted (the executable identity is the only gate).
- `exact` — the full `argv` must deep-equal `allowed_argv`.
- `prefix` — `argv` must start with every token in `allowed_argv`.
- `regex_per_arg` — `arg_patterns[i]` (a `RegExp`, unicode) must match argument `i`;
  the argument **count** must match exactly. Invalid patterns fail `validatePolicy`.

> **`resolved_path_sha256` caveat.** This hashes the resolved *path*, not the
> executable's *bytes*. It detects a changed path (e.g. a different resolution of a
> name), not a swapped binary at the same path. Byte-level pinning is not
> implemented in this layer and must not be implied. **[assumed]** the binary at a
> pinned path is the intended one.

## ResourceBudget

Enforceable limits (each has a dedicated denial code) and the unattested
disclosure.

| Field | Enforced? | Denial code | Notes |
|-------|-----------|-------------|-------|
| `wall_clock_ms` | **[enforced]** | `OML_PROCESS_TIMEOUT` | SIGKILL at the deadline (`process.ts`). |
| `max_output_bytes` | **[enforced]** | `OML_PROCESS_OUTPUT_LIMIT` | Combined stdout+stderr; process killed when exceeded. |
| `max_command_count` | **[enforced]** | `OML_COMMAND_BUDGET_EXCEEDED` | Counts admitted `exec` calls per broker. |
| `max_retries` | **[enforced]** | `OML_RETRY_BUDGET_EXCEEDED` | Charged explicitly via `chargeRetry`. |
| `max_generated_files` | **[enforced]** | `OML_FILE_COUNT_BUDGET_EXCEEDED` | Counts admitted writes. |
| `max_write_bytes` | **[enforced]** | `OML_WRITE_BYTES_BUDGET_EXCEEDED` | Sum of UTF-8 write byte lengths. |
| `unattested` | disclosure only | `OML_POLICY_INVALID` if incomplete | **Must** list all of `cpu`, `memory`, `disk`, `network`, `syscalls`, `process_tree`. |

The `unattested` requirement is the teeth of mandatory principle 8: a policy that
omits any unenforceable resource is **rejected**, so a reader can never be misled
into thinking an unbounded resource is bounded. There is no `safe: true` flag
anywhere; safety is per-capability and per-field, never global.

## CapabilityManifest (schema defined, registry empty)

For a future deterministic capability. Present so the *shape* is fixed; **no
instance is registered yet**.

| Field | Meaning |
|-------|---------|
| `id`, `version` | Identity and independently-versioned semantics (principle 10). `version` is semver `x.y.z`. |
| `impl_kind` | `builtin_deterministic` or `external_process`. Learned kinds are out of scope (ADR 0009). |
| `determinism` | `deterministic` or `model_dependent`; the loader **rejects** `model_dependent` until a causal result justifies it. |
| `scopes` | `{ reads, writes, commands, env }` — the policy scopes the capability needs. |
| `network` | Constant **false** — no capability in this layer is granted network (it is unattested, so a capability must not require it). |
| `timeout_ms`, `max_output_bytes` | Bounded cost. |
| `side_effects` | `none` \| `workspace_files` \| `process_execution`. |
| `reversibility` | `pure` \| `reversible_in_workspace_copy` \| `irreversible`. |
| `evidence_kind` | The evidence kind produced: `configured_verifier_exit` \| `typed_observation` \| `content_hash` \| `process_result` \| `none`. |
| `failure_modes` | Optional list of `OML_*` codes the capability may raise. |
| `platforms` | Non-empty subset of `linux` \| `darwin` \| `win32`. |
| `promotion_status` | `candidate` \| `registered` \| `deprecated`. Only `registered` is admissible at runtime; **no capability is born registered**. |

## Validation status

Field semantics **verified by source inspection** against `src/runtime/types.ts`,
`src/runtime/broker.ts`, and `schemas/capability-policy.schema.json`. Schema-to-code
conformance has **not** been executed (no `ajv` run this session; classifier down)
and is **owed**.