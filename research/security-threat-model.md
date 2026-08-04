# Security threat model

## Status

This is a design threat model. **No claim of safety is made.** The current
repository contains only an evaluation skeleton and research documents, not a
cross-platform sandbox implementation.

## Assets and trust boundaries

Trusted control-plane assets:

- user authorization and approval decisions;
- model credentials and billing configuration;
- capability registry and permission policy;
- fixture answers and hidden tests;
- fixed patches, oracle packets, intervention reviews, task labels, split
  membership, treatment assignments, and other-arm traces;
- append-only evidence ledger and receipt signer;
- artifact store outside model-directed filesystem scope.

Untrusted or conditionally trusted inputs:

- user issue text, repository files, Git history, dependencies, tests, logs,
  web pages, CI artifacts, MCP tool metadata/output, and all model output;
- all task instruments, even when created by Luna or Sol;
- the sandbox workspace and any process it launches.

The trusted harness must run outside the generated-code sandbox. This follows
OpenAI's current sandbox architecture guidance. Container isolation and action
authorization are separate controls; OpenHands issue #13150 illustrates the
gap when only containment exists.

## Threat matrix

| Threat | Attack path | Required control | Verification test | Residual risk |
|---|---|---|---|---|
| Generated arbitrary code | instrument invokes destructive or escape behavior | Tier 3 off by default; isolated non-root sandbox; seccomp/job object; no host socket | malicious file delete, mount, namespace, and escape fixtures | kernel/container vulnerabilities |
| Command injection | task value enters shell string | argv arrays only; no implicit shell; strict schema and allowlist | metacharacter, newline, quote, and Unicode payloads | allowed executable may interpret hostile input |
| Repository prompt injection | README/comment/test tells model to leak or alter policy | mark source as data; structured extraction; capability policy outside model; no secret/network access | poisoned issue/repo corpus | model may still make bad in-scope edits |
| MCP/tool poisoning | malicious descriptions or results redirect behavior | pinned registry digest; trusted metadata; output treated as untrusted; approvals for side effects | mutated tool schema and result fixtures | compromised trusted server |
| Secret exfiltration | environment/file access plus network or artifact channel | no secrets in execution plane; environment allowlist; network deny; output scanner and size bounds | canary environment/file and DNS/HTTP attempts | covert channel through permitted output |
| Filesystem escape | `..`, absolute path, symlink, junction, hardlink, case tricks | path canonicalization after open; dirfd/handle-relative operations; no-follow; mount scope | cross-platform traversal/symlink corpus | OS-specific filesystem semantics |
| Network access | direct socket, package manager, DNS, subprocess | deny by default at OS/network boundary; explicit domain grant outside generated process | TCP/UDP/DNS/package-manager probes | local services and proxy misconfiguration |
| Dependency confusion | generated install resolves attacker package | no install by default; lockfile plus hash; isolated setup stage; private index policy | same-name public package fixture | compromised registry or dependency |
| Malicious tests | test reads secrets, destroys repo, forks processes | tests run in same untrusted sandbox with resource caps and disposable worktree | destructive test fixtures | tests can still waste capped resources |
| Denial of service | fork bomb, huge output, disk fill, infinite loop | PID/CPU/memory/disk/output/token/wall limits; cancellation tree | fork, allocation, output, and sleep bombs | platform limit gaps, especially native Windows/macOS |
| Git history alteration | reset, force update, hooks, config rewrite | disposable worktree; deny writes to source repo `.git`; capture diff from worktree only | malicious git commands and hook fixtures | user later applies a bad patch |
| Evidence tampering | sandbox rewrites logs/artifacts or forges success JSON | harness captures raw process result; content hashes; hash-linked events outside mount; capability identity | modify/delete/replay artifact fixtures | trusted harness compromise |
| Stale evidence | code changes after test or screenshot | evidence records depend on tree/file/environment hashes; invalidation reducer | edit dependency after evidence creation | incomplete dependency declaration |
| False success artifact | tool returns fabricated pass | independent exit status plus expected artifact/schema and negative control | fake JUnit, fake screenshot, zero-test pass | malicious test framework binary |
| Cross-platform mismatch | Linux sandbox guarantees assumed on Windows/macOS | backend capability attestation; deny unsupported policy; platform security suite | Windows junction/job-object and macOS sandbox tests | no identical guarantee across OSes |
| Cost exhaustion | repeated calls/retries or giant context | per-run hard token/dollar/tool/wall budgets; deterministic retry classifier | forced transient and deterministic failures | provider usage reporting delay |

## Default policy

- Network: denied for all instruments. Package installation is a separate,
  approved setup phase with a lockfile and no model credential.
- Secrets: never mounted or inherited by the execution plane.
- Filesystem: fresh disposable worktree plus bounded temp and artifact output;
  original repository and control-plane state are not writable.
- Processes: allowlisted executables where practical; bounded descendants,
  wall time, CPU, memory, file descriptors/handles, disk, and captured output.
- Permissions: explicit, visible, least privilege, and monotonic under
  composition. No instrument can grant itself a permission.
- Evidence: control plane records actual argv, exit status, environment digest,
  relevant input hash, output hash, timestamps, and capability version.
- Cleanup: process tree terminated, mounts detached, workspace quarantined or
  removed, and failure recorded. Cleanup success is independently checked.
- Promotion: no automatically generated instrument enters the registry.

## Oracle-study confidentiality

Each adapter request is constructed from one treatment-specific packet and
contains only `schema_version` plus the selected payload. The model workspace
does not receive the packet file, review, fixed commit, hidden verifier, labels,
assignment, or another arm's trace. Packet/task/base/design/level and freeze
hashes are checked before execution. The configured verifier receives no
treatment field or treatment environment variable.

These are interface controls, not containment. The current adapter, verifier,
and repository process execute with host authority; a trusted verifier could
inspect sibling run files, and malicious repository tests could inspect the
host. Filesystem copy isolation cannot enforce scorer blindness or hidden-data
confidentiality against such a process. Gate H must not execute hostile code or
claim security until an attested sandbox and separate scorer boundary exist.

## Evidence integrity model

An evidence record is valid only if:

1. its producer capability version is trusted;
2. its artifact hash matches;
3. all declared dependency hashes still match;
4. the environment attestation satisfies the claim scope;
5. it has not expired;
6. its acquisition status is `observed`, not `reported` or `inferred`.

User-provided evidence is preserved as `reported` unless Oh-My-Luna can
independently observe it. A screenshot supports a visual claim, not internal
behavior. Static analysis supports code-shape claims, not executed behavior.
A passing existing suite supports regression evidence only; it does not prove
the issue-specific behavior unless the tests discriminate the requested case.

## Cross-platform reality

Linux can implement strong local isolation using namespaces, cgroups, seccomp,
and read-only mounts. macOS and Windows use different primitives and container
availability is not guaranteed. V0 must expose backend capability attestation
and refuse Tier 3 execution when required controls are missing. “Runs on all
three operating systems” must not be conflated with “same isolation guarantee
on all three operating systems.”

## Required security gate before Tier 3

Tier 3 remains disabled until all supported backends pass a public adversarial
suite covering every matrix row, including repository-borne injection, path
confusion, malicious tests, evidence forgery, and resource exhaustion. A single
container smoke test is insufficient.
