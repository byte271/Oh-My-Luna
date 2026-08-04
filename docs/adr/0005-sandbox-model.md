# ADR 0005: Sandbox model

## Context

Repositories, tests, and generated instruments can run hostile code. Supported
desktop platforms provide different isolation primitives.

## Options

1. Run directly on the host.
2. Put harness and execution in one container.
3. Trusted host harness plus disposable sandbox execution adapter.
4. Hosted sandbox only.

## Evidence

OpenAI's current Agents SDK guidance separates trusted harness and compute.
Codex disables network and scopes writes by default. NIST documents container
risks. OpenHands experience shows both Docker value and authority/host-socket
concerns.

## Decision

Keep policy, credentials, ledger, and receipts outside the execution sandbox.
Require backend attestation. Refuse Tier 3 if the backend cannot enforce the
declared policy.

## Consequences

Local deterministic capabilities can run where safe; generated code has a hard
availability boundary. Backend conformance work is required on every platform.

## Rejected alternatives

Direct host execution has unacceptable blast radius. A shared container lets
generated code attack policy/evidence. Hosted-only violates local-first scope.

## Reversal conditions

Adopt a stronger VM/microVM backend if containers cannot meet the security
suite or enterprise threat model.

