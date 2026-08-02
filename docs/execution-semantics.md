# Execution semantics

## Run state

The canonical state is a fold over valid events, not a mutable status file.

```text
accepted -> compiled -> investigating -> diagnosed -> patch_proposed
         -> patch_applied -> verifying -> terminal
```

Terminal outcomes are `completed`, `failed`, `blocked`, `cancelled`, and
`budget_exhausted`. `completed` is reachable only through the claim policy.

## Core event types

- `run.started`
- `task.compiled`
- `capsule.created`
- `hypothesis.recorded`
- `capability.requested`
- `capability.started`
- `capability.finished`
- `evidence.recorded`
- `evidence.invalidated`
- `patch.proposed`
- `patch.applied`
- `claim.assessed`
- `run.terminal`

Every event has run ID, sequence number, timestamp, payload schema version,
previous hash, and event hash. Payloads reference artifacts by hash rather than
embedding unbounded content.

## Claim types and evidence

| Claim | Accepted evidence | Common invalidator |
|---|---|---|
| `failure_reproduced` | observed command result plus discriminating assertion | relevant code/config/environment change |
| `not_reproducible` | bounded documented attempts and environment comparison | new reproduction input or environment |
| `root_cause_supported` | static dependency plus runtime/behavioral discriminator | relevant source or input change |
| `patch_scoped` | diff analysis against authorized paths/non-goals | patch change |
| `requested_behavior_verified` | issue-specific hidden or generated discriminating test | patch, test, or environment change |
| `regression_checked` | selected existing suite with collection count and result | patch or dependency change |
| `visual_verified` | screenshot/render at declared viewport plus rubric | UI source/build/viewport change |
| `security_negative_control` | observed malicious/invalid input refused safely | trust-boundary code/config change |
| `delivery_ready` | required artifacts exist and hashes match | artifact mutation |

## Evidence classes

- `observed`: captured directly by the trusted harness.
- `reported`: user, issue, CI, or external system statement.
- `inferred`: model or deterministic analysis conclusion from other records.
- `waived`: authorized exception with actor, reason, and scope.

Only `observed` evidence can independently satisfy behavioral claims. Static
claims may accept deterministic `inferred` evidence when the claim policy names
the producer. `reported` evidence can motivate a task but not prove completion.

## Invalidation

Each evidence record declares dependencies such as tree hash, file hashes,
command/tool version, environment digest, fixture hash, viewport, and upstream
evidence IDs. After any patch, the reducer recomputes affected dependencies and
emits invalidation events. Validation is monotonic only when dependencies remain
unchanged.

## Overrides and impossible evidence

When reproduction or a platform cell is unavailable, the system records
`unsupported` or `impossible` with attempted methods and missing prerequisites.
It may continue with static diagnosis, but the receipt cannot convert that into
observed behavior. User waiver can permit delivery, but status is
`completed_with_waiver` at the claim level and remains visible.

## Small-task fast path

The direct template may compile only three mandatory claims: patch scoped,
requested behavior verified, and regression checked. It does not require a
hypothesis ledger, debugger, or multi-stage review when the task has a direct
deterministic oracle. This prevents the evidence model from becoming ceremony.

## Cancellation and resumption

Cancellation terminates the process tree, records partial artifacts, and emits
`run.terminal(cancelled)`. Resumption creates a new attempt linked to the prior
run, replays valid state, re-checks repository/environment hashes, invalidates
stale evidence, and never replays side effects automatically.

