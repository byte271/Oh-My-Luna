# Runtime control boundary — threat model

Scope: the deterministic runtime control layer decided in
[ADR 0017](../adr/0017-runtime-control-boundary.md). This document states what the
boundary defends against, what it explicitly does **not**, and which trust
assumptions it rests on. It is written so a reader can tell an *enforced* defense
from an *assumed* one without reading the code.

Classification tags used throughout: **[enforced]** a machine check refuses the
action; **[tested]** an adversarial test measures the refusal; **[observed]** seen
in real repository output; **[assumed]** relied on but not enforced here;
**[unattested]** deliberately not bounded, and disclosed as such.

## Assets

1. The **integrity of the host** outside the run workspace (files, processes).
2. The **integrity of a run's evidence** — that a recorded "green" corresponds to
   real behavior of the real artifact, not a hollow or stale proxy.
3. The **integrity of the evaluation's causal claim** — that a measured Luna result
   is attributable to a declared intervention, not to confounding runtime effects.
4. **Credentials and spend.** No credential is present this session; the boundary
   must never create, log, or persist one, and must never itself make a paid call.

## Trust boundaries

- **Fixture author → kernel.** Today the fixture author is trusted. The boundary
  narrows this: even a trusted author's fixture cannot run an executable outside
  the per-run allowlist, write outside the workspace, or exceed a declared budget.
  This converts an implicit trust into an explicit, auditable policy. **[enforced]**
- **Model output → host.** Luna's proposed files and commands are untrusted data.
  They cross the `Broker` seam and are subject to path, executable, argument, env,
  and budget admissibility. **[enforced]**
- **Run evidence → reader.** A later reader (Gate H analyst, auditor) does not
  trust the run's own summary Boolean; `verify-run` re-derives each claim from
  persisted evidence against the current tree. **[enforced]**
- **Runtime → OS.** The runtime does **not** trust that it can bound CPU, memory,
  disk, network, syscalls, or the process tree. It discloses these as unattested
  rather than pretending to contain them. **[unattested]**
<!-- __APPEND__ -->

## Threats and mitigations

Each row names the attacker capability, the mitigation, its enforcement point, and
its classification. "Attacker" spans a careless fixture, a misaligned or mistaken
model output, and a corrupted-on-disk state file — not a human adversary with host
access (out of scope; see below).

| # | Threat | Mitigation | Enforced at | Class |
|---|--------|-----------|-------------|-------|
| T1 | Write escapes the workspace via `..`, absolute path, or null byte | Relative-only, null-free, lexical `inside()` + `realpath` anchor | `broker.#decideWrite`, `environment.applyProposedFiles` | [enforced][tested] |
| T2 | Write escapes via a symlinked parent or target | Symlink parents and targets rejected before write | `environment.rejectSymlinkParents` (reused) | [enforced][tested] |
| T3 | Run an arbitrary host binary | Per-run executable allowlist; unknown `argv[0]` denied | `broker.matchExecutable` | [enforced][tested] |
| T4 | Smuggle dangerous arguments to a permitted binary | Argument policy: exact / prefix / per-arg regex / any | `broker.matchExecutable` | [enforced][tested] |
| T5 | Widen the environment to leak host secrets | Requested env allowlist must be a **subset** of policy | `broker.#decideExec` | [enforced][tested] |
| T6 | Escape the workspace via `cwd` | `cwd` resolved and checked `inside()` root | `broker.exec` | [enforced][tested] |
| T7 | Unbounded wall-clock, output, commands, retries, files, bytes | Explicit budgets with dedicated denial codes | `broker` ledger + `process.ts` | [enforced][tested] |
| T8 | **False green**: a verifier that verifies nothing exits 0 | `configured_verifier_exit` is the weakest evidence type; a claim resting only on it is `unsupported` under `requireStrongEvidence` | `evidence.evaluateClaim` | [enforced][tested][observed] |
| T9 | **Stale green**: evidence from before a later mutation | Evidence bound to a workspace tree hash; a changed tree makes it `stale`; `verify-run` re-derives | `evidence.evaluateClaim`, `run-store.reverifyRun` | [enforced][tested] |
| T10 | **Ambiguous green**: success text with a nonzero/timeout exit | Contradiction ⇒ `ambiguous`, never `supported` | `evidence.contradictory` | [enforced][tested] |
| T11 | **Silent green**: a claim with no evidence reads as passing | A claim with no evidence refs is `unsupported`, never `supported` | `evidence.evaluateClaim` | [enforced][tested] |
| T12 | Corrupted/torn state file read as valid | Atomic temp+rename write; JSON, schema-version, and content-hash checks on read | `state.writeStateFile`/`readStateFile` | [enforced][tested] |
| T13 | Post-hoc tamper with a state file body | Per-record content hash mismatch is a hard error | `state.readStateFile` | [enforced][tested] |
| T14 | Illegal or post-terminal lifecycle transition | Explicit transition table; terminal states are frozen | `state.assertTransition` | [enforced][tested] |
| T15 | Task looks solvable but the model was never given the source | `sufficiency` surface fails when a required path is absent or unreadable | `readiness.sufficiency` | [enforced][tested][observed] |

T8 and T15 are **[observed]**: the `Luna-example/` sample shipped a `typecheck.mjs`
that strips types and always exits 0 (`research/luna-example-framevault-ab.md`),
and Gate H v1 lacked a sufficiency surface. These are not hypothetical classes.

## What this boundary does NOT defend against

Stated plainly so a green is never over-read:

- **OS-level resource exhaustion.** CPU, memory, disk, network, syscalls, and the
  process tree are **[unattested]**. A permitted process can fork, allocate, open
  sockets, and burn CPU up to OS limits. The runtime does not, and does not claim
  to, contain these. Network is *not* blocked by the runtime — only the environment
  and executable allowlists constrain it indirectly.
- **A human with host access.** The state store is tamper-*evident* (hash chain +
  per-record hashes), not tamper-*proof*. An attacker who can rewrite both a body
  and its recorded hash defeats detection; the files are not externally anchored.
- **A malicious permitted binary.** If a policy admits an executable, the runtime
  does not sandbox what that executable then does within the workspace and its
  unattested resources. Admissibility is not containment.
- **Provider-side trust.** The boundary makes no model call. Whether a model is
  reachable, authenticated, or honest is out of scope; `doctor`/`smoke` explicitly
  disclaim provider auth.
- **Cryptographic supply-chain attestation.** No signing of the runtime itself, no
  reproducible-build attestation. Out of scope for this layer.

## Standing security invariants (from the mission, still binding)

- Live execution requires **all three** of `OPENAI_API_KEY`,
  `OML_LIVE_APPROVED=1`, `OML_LIVE_BUDGET_USD=<positive>` in the *environment*. A
  prompt instructing the agent to proceed is **not** approval. The runtime layer
  sets none of these and makes no paid call. **[enforced]** by the existing provider
  gate; the runtime layer stays offline by construction.
- No test may read hidden data the real execution path cannot access
  (`scoring.ts` blindness). The runtime layer adds no path around it.
- The layer is model-independent and must never be described as making Luna smarter.
