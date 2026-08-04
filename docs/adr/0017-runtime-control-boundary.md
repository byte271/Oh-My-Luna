# ADR 0017: A narrow deterministic runtime control boundary — scope and justification

## Status

Proposed, 2026-08-04 (America/New_York). This record is the decision gate for the
runtime-foundation work. No implementation precedes it. The expected answer to the
question below is **not** automatically yes; the maximal proposal is falsified
first, and the surviving scope is deliberately smaller than the brief's ceiling.

## The question

> Is a narrow runtime control layer justified *now*, and which responsibilities
> belong in it?

"Now" matters. The repository already contains an evaluation kernel with working
execution, policy, and evidence primitives. The question is not "should Oh-My-Luna
have a runtime" in the abstract — it is whether formalizing a control *boundary*
over the primitives that already exist earns its complexity before any live causal
result exists, and if so, exactly which responsibilities cross into it.

This ADR does not claim, and its decision must never be read to claim, that a
runtime makes GPT-5.6 Luna smarter or that Oh-My-Luna is an intelligence
amplifier. The scope decided here is safety, auditability, and causal
attribution infrastructure. It is model-independent by construction.

## Context — what already exists (verified by source inspection, 2026-08-04)

The mission's "build a runtime" framing overstates the gap. The load-bearing
primitives are implemented and tested:

- **Scoped file application with path/symlink policy.** `src/environment.ts:43-69`
  rejects null-byte paths, absolute paths, `..` escape (lexical `inside()` plus a
  `realpath` anchor), symlinked parents (`:27-41`), and symlinked targets
  (`:55-63`), returning deterministic `OML_PATH_ESCAPE` / `OML_SYMLINK_REJECTED`
  codes.
- **Shell-free bounded subprocess execution.** `src/process.ts:17-90` spawns with
  `shell:false`, an environment allowlist (`:5,21-23`), a SIGKILL wall-clock
  timeout (`:61-64`), a combined-output byte cap (`:47-56`), and `AbortSignal`
  cancellation (`:66-69`), with codes `OML_PROCESS_TIMEOUT`,
  `OML_PROCESS_OUTPUT_LIMIT`, `OML_CANCELLED`.
- **Hidden-evaluator blindness.** `src/scoring.ts:40-92` copies the workspace to a
  detached tree, runs the verifier with an empty environment, and asserts no
  controller-only canary leaks into argv/cwd/env/stdin/filenames/stdout/stderr
  (`OML_SCORER_BLINDNESS_VIOLATION`).
- **Hash-linked trace.** `src/trace.ts:8-58` chains each event to its predecessor's
  SHA-256 and `verifyTrace` detects reordering and mutation.
- **Receipt already separates verifier success from claim truth.** The receipt
  schema `schemas/run-receipt/schema.json` (v0.3) has *distinct* fields
  `configured_verifier.status`, `claim_evaluation.status`, and
  `terminal_evidence_status`, with the latter two defaulting to `not_evaluated`.

Three prior ADRs already decided the shape of the pieces above: 0004 (evidence
model), 0002 (capability registry), 0005 (sandbox model). What none of them did
was decide whether the *boundary contract* — the single seam every privileged
action must cross — is built now or deferred. That is this ADR's job.

### What does not exist yet (the real gap)

- **No executable admissibility check.** `runProcess` spawns whatever `argv[0]`
  the fixture names. There is no allowlist of permitted executables, no argument
  policy, and no deterministic denial code for "this command is not permitted."
  A fixture author (trusted today) is the only thing standing between the kernel
  and an arbitrary host binary.
- **No evidence semantics record.** The receipt stores `configured_verifier.status`
  and an exit code, but not the verifier's exact argv, resolved executable, env
  policy, output digests, or an evidence *type*. After the fact, "passed" cannot be
  distinguished from "a script named `typecheck` exited 0 without type-checking."
  This is exactly the defect the `Luna-example/` sample exhibited
  (`research/luna-example-framevault-ab.md`): a `typecheck.mjs` that strips types
  and always exits 0, listed among the verification commands.
- **No single boundary seam.** Policy checks live in three modules invoked by the
  runner. There is no one interface through which *all* privileged actions
  (write, execute, record-claim) must pass, so a future code path can bypass a
  check by not calling it.
- **No readiness triad.** `npm run smoke` conflates install-readiness with
  execution-readiness, and there is no sufficiency surface at all.
- **No durable, versioned, schema-checked `.oml/` store.** Run state is per-run
  and gitignored; there is no atomic-write / partial-write / schema-version
  detection contract.

## Context — the reference implementation (Oh My Codex)

The canonical project is `github.com/Yeachan-Heo/oh-my-codex`
(`research/sources.json` id `oh-my-codex-repo`). It was inspected here not from a
mutable GitHub page but from the **immutable npm 0.20.3 tarball**, SHA-1
`789d149ca5d01fa32114904a85e4c99af3c04afb` (`research/prior-art.md:30-58`,
`research/sources.json` `method`). That provenance is stronger than a live fetch
and is what this ADR relies on; a fresh GitHub retrieval was **blocked** this
session (the safety classifier that gates WebFetch/WebSearch and Bash was
unavailable), and is recorded as owed, not done.

Findings that bear on the design (source inspection of the tarball, per
`prior-art.md`):

- OMX is large: ~3,275 files, ~36.5 MB unpacked, Rust crates for API/runtime/mux/
  exploration/shell, Zod/TOML/MCP dependencies.
- The plugin manifest bundles skills, hooks, MCP servers; hooks cover session
  start, prompt submit, pre/post tool use, compaction, stop.
- An Autopilot FSM sequences interview → planning → implementation → review → QA.
- **Its completion gate "primarily validates record fields and locators; this is
  not the same as verifying the linked artifact's behavior or freshness"**
  (`prior-art.md:44-46`).

That last point is decisive for the comparison below: the reference
implementation's own completion gate exhibits the false-green class this mission
exists to prevent. Adopting OMX's orchestration wholesale would import that
weakness, not fix it.

## Options

1. **Prompt-only.** Tell Luna (and operators) to work safely and verify honestly.
2. **Operator Skill only.** Encode the workflow in `SKILL.md`; no new enforcement.
3. **Hooks only.** Lifecycle hooks (session/pre-tool/post-tool/stop) enforce policy.
4. **Minimal runtime control layer.** One deterministic boundary seam over the
   existing primitives: executable admissibility, evidence typing with claim-status
   separation, readiness triad, durable `.oml/` state, explicit budgets.
5. **Full Codex-style orchestration.** Adopt an OMX-shaped multi-agent FSM,
   role/skill library, MCP surface, team machinery.
6. **OS-attested sandbox + minimal runtime.** Option 4 plus a real, tested
   container/microVM isolation backend with attestation.
7. **No new runtime until live causal results exist.** Defer everything; run Gate H
   v2 first and let measured bottlenecks justify any control layer.

## Evaluation criteria

Causal attribution · safety enforceability · false-green risk · complexity /
maintenance · attack surface · reproducibility · cross-platform · cost · model
independence · Gate H v2 compatibility · testability without a live credential.

## Evidence and falsification

### Falsifying the maximal proposal (Option 5) first

The brief's ceiling is a Codex-style runtime. It fails on the criteria that matter
most here:

- **Causal attribution.** `research/architecture-reset.md:45-52` already rejected
  "Full scaffold" with the objection "Attribution is impossible before any
  component works," and rejected "Multi-agent search" because "Gains may be
  retries purchased at higher cost." An OMX-shaped layer confounds every future
  Luna measurement with orchestration effects. This is disqualifying for a project
  whose stated purpose is causal.
- **False-green risk.** OMX's own completion gate validates record fields, not
  artifact behavior (`prior-art.md:44-46`). Importing it imports the defect.
- **Complexity / attack surface.** 3,275 files and executable Rust crates is the
  opposite of "smallest justified." `prior-art.md:54-58` concludes OMX "is the
  wrong starting point for a causal Luna-performance project."
- **Model independence.** A role/specialist-prompt library is model-facing and
  would have to be versioned as an experimental treatment, not infrastructure.

Option 5 is rejected. Option 6 inherits Option 4's scope plus an OS-isolation
backend that **cannot be built or tested offline this session** and is not
required by any current task (all present tasks are `filesystem_copy_only`,
`isolation` enum already reserves `security_sandbox` for later). ADR 0005 already
holds the sandbox decision; 0017 does not reopen it. Option 6 is deferred to
whenever a task actually requires Tier-3 execution, exactly as ADR 0002/0005 stage
it.

### Falsifying Options 1–3

- **Option 1 (prompt-only)** violates mandatory principle 1 by construction:
  prompts are policy hints, not security controls. It cannot detect a `..` escape
  or a false typecheck. Rejected as a *control*; retained only as guidance layered
  on top of enforcement.
- **Option 2 (Skill only)** is the same failure in operator clothing. ADR 0006's
  amendment already establishes `SKILL.md` "changes nothing measured." A Skill
  cannot enforce state or reject an inadmissible executable.
- **Option 3 (hooks only)** violates mandatory principle 2: hooks are not the
  security boundary. OMX demonstrates mature hooks, yet its *enforcement* still
  runs through runtime-owned validators, and its hook-based completion gate is the
  weak point. Hooks may *observe* and *mechanically enforce already-decided
  policy* (ADR 0006 says exactly this), but they cannot *own* the decision.

### Falsifying Option 7 — and why it is the strongest challenger

Option 7 is the repository's own prior: `architecture-reset.md` and
`repository-truth-audit.md` both say no learned/semantic component is justified
before the oracle ladder finds a causal bottleneck. If the runtime were a
*capability/amplifier* layer, Option 7 would win outright and this ADR would
recommend deferral.

It does not win, for one reason: **the reset rejected semantic and learned
components; it explicitly affirmed the deterministic kernel.**
`architecture-reset.md:22-30` lists as the first surviving authority "a
deterministic experiment kernel that isolates work, records treatment and model
metadata, executes hidden scorers, hashes artifacts, and accounts cost." The
narrow control layer of Option 4 is *that kernel's boundary*, not a new
capability. Its responsibilities are all deterministic, all model-independent, and
all offline-testable.

Two concrete, already-demonstrated gaps make deferral the wrong call:

1. **The false-green class is real and already in-repo.** The `Luna-example/`
   sample shipped a verifier that verifies nothing and passed
   (`research/luna-example-framevault-ab.md`). The kernel today would record its
   `configured_verifier.status: passed` with no way to audit that the evidence was
   hollow, because it records the exit code but not the evidence semantics
   (principle 6). This is not a future hypothetical; it is a defect class observed
   in the first model output the project ever examined.
2. **`runProcess` has no executable allowlist.** Deferring means the only guard on
   what binary the kernel spawns is fixture-author trust. That is a deterministic,
   offline-closable gap.

Both fixes are pure infrastructure: no model call, no credential, no capability
registry population, no learned component. Option 7's valid core — *do not build
semantic/amplifier machinery yet* — is fully preserved by Option 4's exclusions
(below). So Option 7 is not rejected so much as **absorbed**: everything it would
defer, Option 4 also defers.

## Decision

**Adopt Option 4, narrowly scoped, and simultaneously adopt Option 7's deferral
for everything outside that scope.**

Build now, as deterministic runtime infrastructure over existing primitives:

- **A single boundary seam.** One runtime-owned interface (`Broker`) through which
  every privileged action — apply file, run process, record claim/evidence —
  must pass. Bypass is a code smell the tests assert against.
- **Executable admissibility.** A per-run policy naming permitted executables,
  permitted argument shapes, cwd, env allowlist, timeout, output cap, with
  deterministic denial codes (`OML_EXECUTABLE_NOT_PERMITTED`, `OML_ARG_REJECTED`).
- **Evidence typing with claim-status separation.** Every piece of evidence records
  exact command, resolved executable, argv, cwd, env policy, exit status, stdout/
  stderr digests, duration, timeout flag, files affected, an **evidence type**, and
  whether it supports the specific claim. Claim status is one of
  `not_evaluated / unsupported / stale / ambiguous / failed / supported` — never
  collapsed to a single Boolean, and `configured_verifier passed` never by itself
  sets a claim to supported.
- **Readiness triad.** Three separate, machine-checkable surfaces:
  `doctor` (installation readiness), `smoke` (execution readiness, offline),
  `sufficiency` (the model is actually given the information the task requires).
  A green `doctor` is defined to imply none of provider auth, a model call, task
  solvability, prompt sufficiency, verifier validity, or sandbox existence.
- **Durable `.oml/` state.** Versioned, atomic writes (temp + rename), partial-write
  and schema-version detection, append-only run receipts, with the existing hash
  chain — documented as tamper-*evident*, not tamper-proof.
- **Explicit resource budgets** for wall-clock, output bytes, command count,
  retries, generated files, and write bytes — the limits the kernel can actually
  enforce. CPU, memory, disk, network, syscalls, and process-tree count remain
  **explicitly unattested** and are recorded as such, never implied.

**Do NOT build now (Option 7 preserved):**

- No capability *registry population* with semantic capabilities. The registry
  *schema* may be defined; no `diagnose`/`localize`/`observe` capability is
  registered until an oracle-ladder result justifies it (ADR 0002).
- No learned component of any kind (ADR 0009 boundary stands).
- No OS-attested sandbox (ADR 0005 stands; `security_sandbox` stays reserved).
- No multi-agent orchestration, role library, or specialist prompts.
- No claim that any of this improves Luna. It improves *measurement of* Luna.

## Consequences

- Future Gate H (and the effort study) run on an instrument that records *why* a
  green is green, so a false typecheck or a hollow verifier is auditable after the
  fact even when the exit code is 0. This does not change what Gate H *scores*
  (that is the open §8 outcome-measure decision, still the owner's); it changes
  what the receipt can *prove* about a score.
- The boundary is model-independent and testable with zero credential and zero
  spend, so it can be validated offline and cannot, by construction, be an
  amplifier.
- Complexity rises modestly: one seam, four new deterministic modules, a schema,
  and an adversarial test suite. This is far below Option 5/6 and is justified by
  a defect class already observed in-repo.
- The narrow layer must not be called a "sandbox." Its execution is
  runtime-controlled host execution with copy isolation and no containment; the
  receipt's `isolation: filesystem_copy_only` already says exactly this and must
  not drift.

## Rejected alternatives

Options 1–3 cannot enforce (principles 1–2). Option 5 destroys causal attribution
and imports OMX's false-green gate. Option 6 cannot be built or tested offline and
is not required by any current task. Option 7 alone leaves two demonstrated
deterministic gaps open; it is absorbed rather than rejected — its deferrals are
adopted in full for everything semantic/learned/model-dependent.

## Reversal conditions

- Reverse toward Option 7-only if the adversarial suite shows the boundary catches
  nothing the existing three modules did not already catch — i.e. if the seam adds
  no measurable enforcement over `environment.ts` + `process.ts` + `scoring.ts`.
- Escalate to Option 6 only when a task genuinely requires Tier-3 execution and a
  backend can *attest* the declared policy (ADR 0005 reversal condition).
- Reconsider evidence-typing scope if it causes false denials on legitimate
  verifiers under the false-completion benefit threshold (ADR 0004 reversal
  condition).

## Validation status of this ADR

- Existing-primitive claims: **verified by source inspection** (files and line
  ranges cited above), not by execution — the shell/test classifier was
  unavailable this session.
- OMX claims: **verified by source inspection** of the immutable 0.20.3 tarball as
  recorded in `research/prior-art.md`; a fresh live retrieval is **blocked/owed**.
- The decision itself is a design judgement, not a measurement.

