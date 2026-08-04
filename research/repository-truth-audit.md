# Gate R0 — repository truth audit

Date: 2026-08-01 (America/New_York)  
Remote: `byte271/Oh-My-Luna`  
Audited remote base: `93837e1f60e77abf897ad965be397b9a040a1ce4`  
Working branch: `research/trainable-scaffold-reset`

## Gate verdict

**Measured repository result:** the current project is an evaluation kernel. It
is not yet an intelligence amplifier. No implemented component has shown a
causal improvement in GPT-5.6 Luna.

**Inference:** the kernel is useful because controlled interventions, hidden
scoring, accounting, and negative controls are prerequisites for discovering an
amplifier. Its documentary architecture must not be mistaken for implemented
capability.

## Reproduction

Before modification:

- **Verified remote fact:** GitHub `main` resolved to `93837e1f60e77abf897ad965be397b9a040a1ce4`, message `Establish research gates and evaluation harness`.
- **Measured local result:** `npm ci` completed.
- **Measured local result:** `npm run typecheck` passed with strict TypeScript settings.
- **Measured local result:** `npm test` passed 11 of 11 tests on Node 24.14.0 and Linux 6.12.13 x86_64.
- **Verified environment fact:** no OpenAI API credential, Codex executable, Docker, or Podman was available.

## Implemented versus documentary

| Component | State at audited base | Evidence |
|---|---|---|
| Strict task fixture | Implemented | `schemas/task-fixture.schema.json`, `src/fixture.ts` |
| External-command model boundary | Implemented interface only | `src/model-adapter.ts`; no provider implementation |
| Filesystem-copy environment | Implemented, not security isolation | `src/environment.ts` |
| Bounded shell-free subprocess execution | Implemented | `src/process.ts` |
| Scoped file application and symlink rejection | Implemented | `src/environment.ts`, negative tests |
| Configured verifier execution | Implemented | `src/scoring.ts` |
| Hash-linked trace | Implemented | `src/trace.ts`, tamper test |
| Content-addressed artifacts | Implemented | `src/artifacts.ts` |
| Aggregate token cost calculator | Implemented but incomplete for provider billing edge cases | `src/cost.ts` |
| Run receipt | Implemented | schema and runner; semantics corrected in R0 |
| Real GPT-5.6 Luna/Sol adapter | Not implemented | no provider SDK or HTTP adapter |
| Luna snapshot profiler | Documentation only | no source module, probes, or measured profile |
| Task compiler / Task IR | Documentation only | no runtime schema or implementation |
| Context compiler | Documentation only | no repository indexer, selector, or capsule implementation |
| Capability registry | Documentation only | no registered capabilities or resolver |
| Instrument compiler / composition | Documentation only | no graph schema or executor |
| Evidence dependency invalidation | Documentation only | trace integrity exists; evidence reducer does not |
| Claim policy | Documentation only | model claims are stored but not evaluated |
| Adaptive controller | Documentation only | no template selector or policy implementation |
| Task Factory / trajectory labels | Not implemented | no executable history-mining pipeline or label schema |
| Learned retriever, diagnostic model, or verifier | Not implemented | no dataset, checkpoint, training, or inference code |
| Attested security sandbox | Not implemented | copy provider refuses declared sandbox-required work |
| Live controlled comparison | Not performed | smoke fixture explicitly uses a deterministic test double |

## Claim audit

### No live capability evidence

**Verified fact:** the README and historical status correctly disclose that no
native Luna, fixed-Skill, Oh-My-Luna, Oh My Codex, or Sol evaluation was run.
The smoke fixture is not a model run. Therefore no performance claim exists.

### Intelligence source

**Verified implementation fact:** the Gate C code contains no component that
selects relevant context, generates hypotheses, chooses discriminating
observations, or diagnoses root cause. The external adapter is expected to
return proposed files directly.

**Source-backed design observation:** the superseded architecture describes a
deterministic compiler, registry, and controller, but does not identify a
learned or stronger semantic policy that knows which missing information Luna
needs.

**Inference:** in the described V0, semantic intelligence ultimately comes from
Luna. Deterministic capabilities may expose facts, but Luna must choose them.
The design could improve reliability and information shape without overcoming
Luna's diagnosis failures.

### Receipt semantics defect

**Verified defect:** schema 0.1 set top-level status to `verified` whenever the
configured verifier returned an allowed exit code. The harness documentation
admitted that this did not establish user claims or stronger evidence.

**R0 correction:** schema 0.2 separates `run_status`,
`configured_verifier.status`, `claim_evaluation.status`, and
`terminal_evidence_status`. Gate C sets the last two to `not_evaluated` because
their stronger semantics are not implemented.

### Pricing premise

**Source-backed observation:** on 2026-08-01, the current official model pages
listed a 25:1 Sol-to-Luna ratio for standard text input, cached input, and
output. The handoff's proposed 5:1 correction was false at retrieval time.

**M5 correction:** `data/pricing/openai-2026-08-02.evidence.json` supersedes the
earlier parsed snapshot as the canonical evidence record. It binds bounded raw
source excerpts and parser code by SHA-256 and records exact retrieval time,
service tier, tool-cost omissions, and limitations. The 2026-08-01 file remains
historical; its hash did not prove what the official page contained.

**Remaining accounting limitation:** aggregated adapter usage cannot recover
per-request long-context charges, cache writes, service tiers, or tool-call
fees. A real adapter must record provider billing items per request.

### Architecture scope

**Verified fact:** original ADRs and architecture documents describe far more
surface than the implementation. R0 preserves them and marks candidate claims
as superseded rather than deleting or silently rewriting the record.

**Decision:** no learned component, context subsystem, capability graph, or
plugin is justified before the oracle-intervention ladder identifies a causal
bottleneck.

## Threat-model gaps

- **Verified:** filesystem copying is not containment. A verifier can execute
  hostile repository code with the host user's authority.
- **Verified:** the subprocess environment is filtered, but the process still
  inherits host filesystem and network reach permitted by the OS.
- **Verified:** time and output are bounded; CPU, memory, disk, process count,
  network, and syscall policy are not.
- **Verified:** hash-linked logs reveal later tampering but are mutable on the
  same filesystem and are not externally anchored.
- **Verified:** adapters and verifiers are trusted executables and can access
  the workspace supplied to them.
- **Untested assumption:** path and process behavior is cross-platform. Tests in
  this run covered only Linux.
- **Design requirement:** hidden tests, oracle labels, and fixed patches must be
  outside model and workspace authority in live experiments.

## Gate R0 decision

Gate R0 permits work on the causal-intervention harness and strong deterministic
baselines. It does not permit training LunaGuide or any other specialist.

The next falsifiable question is not whether a learned guide sounds useful. It
is which oracle intervention—context, localization, observation, diagnosis,
plan, or verification—changes Luna's end-to-end success under an equal-budget
control.
