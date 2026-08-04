# Comparison with Oh My Codex

How the Oh-My-Luna runtime control boundary relates to the reference
implementation, `github.com/Yeachan-Heo/oh-my-codex` (OMX). The point is not
feature parity — it is to show what was deliberately reused, what was deliberately
rejected, and why, given that Oh-My-Luna's purpose is *causal measurement of a
model*, not shipping a coding product.

## Provenance of these OMX claims

OMX was inspected from the **immutable npm 0.20.3 tarball**, SHA-1
`789d149ca5d01fa32114904a85e4c99af3c04afb`, not from a mutable GitHub page
(`research/prior-art.md:30-58`, `research/sources.json`). That is stronger
provenance than a live fetch. A *fresh* GitHub retrieval was **blocked** this
session (safety classifier gating WebFetch/Bash unavailable) and is recorded as
owed. All OMX statements below are **verified by source inspection** of that
tarball; none are inferred from documentation alone.

## Side-by-side

| Dimension | Oh My Codex 0.20.3 | Oh-My-Luna runtime boundary |
|-----------|--------------------|-----------------------------|
| Size | ~3,275 files, ~36.5 MB, Rust crates + Node/TS | 6 runtime modules + 1 schema + 1 CLI over existing primitives |
| Purpose | A production coding agent/product | An instrument to attribute a model's measured performance |
| Orchestration | Autopilot FSM: interview → planning → implementation → review → QA | No agent FSM. A per-run *lifecycle* state machine over deterministic checkpoints only |
| Extension model | Skills, specialist prompts, hooks, MCP servers, teams | None of these are runtime. Prompts are treatments, not infrastructure |
| Isolation | Worktrees; macOS/Linux-tuned | `filesystem_copy_only` copy isolation; **no containment claimed** |
| Completion gate | Validates code-review/QA **record fields and locators** | Re-derives claim status from **evidence semantics vs current tree** |
| Capability model | Capability lockfile hashes tools/skills/agents; flags wrong/hallucinated tool calls | Capability manifest schema defined; **registry empty** until a causal result justifies an entry |
| State | `.omx/` plans, logs, memory, goal state | `.oml/` versioned, atomic, hash-checked; tamper-evident |

## What was reused (as lessons, not code)

- **Durable per-run artifacts.** OMX's `.omx/` store validated that a run should
  leave an auditable trail. Oh-My-Luna's `.oml/` store adopts the *idea* with a
  stricter contract (atomic writes, schema-version and content-hash checks).
- **A capability lockfile concept.** OMX hashes its configured tools and checks
  observed calls against them. Oh-My-Luna's `resolved_path_sha256` and
  `promotion_status` echo this — a capability is pinned and must be justified — but
  the registry stays *empty* until evidence warrants an entry.
- **Hooks as a real surface.** OMX's mature hook set (session/prompt/tool/compaction
  /stop) confirmed hooks are useful for *observation and mechanical enforcement of
  already-decided policy*, matching ADR 0006. It also confirmed hooks are **not**
  the security boundary (below).

## What was rejected, and why

- **The Autopilot FSM and multi-agent teams.** Adopting an OMX-shaped orchestrator
  would confound every future Luna measurement with orchestration effects —
  disqualifying for a causal project (`research/architecture-reset.md:45-52`,
  ADR 0017). Rejected outright for V0.
- **The role/skill/specialist-prompt library.** These are model-facing. In this
  project a prompt is an *experimental treatment* that must be versioned and
  ablated, never baked into infrastructure. A "role marketplace" is explicitly out.
- **The completion gate as a model to copy.** This is the decisive point. OMX's gate
  *"primarily validates record fields and locators; this is not the same as
  verifying the linked artifact's behavior or freshness"* (`prior-art.md:44-46`).
  That is precisely the **false-green class** this runtime exists to prevent.
  Oh-My-Luna's gate does the opposite: it re-derives each claim from evidence
  semantics against the current workspace tree, so a hollow or stale verifier
  cannot read green. Copying OMX's gate would have imported the defect.
- **The size.** 3,275 files is the antithesis of "smallest justified." The boundary
  is six modules over primitives that already existed.

## The one-line differentiation

OMX answers "how do I orchestrate an agent to finish a coding task." The Oh-My-Luna
runtime answers a different, narrower question: "given a model output, what can I
*prove* about whether its claimed success is real, cheaply, offline, and without
confounding the measurement of the model." The overlap is packaging and durable
state; the divergence is that Oh-My-Luna treats a green as a claim to be
re-verified, not a record to be validated.

## Validation status

OMX claims **verified by source inspection** of the 0.20.3 tarball (per
`research/prior-art.md`). A fresh live GitHub retrieval is **blocked/owed**. The
Oh-My-Luna side is **verified by source inspection** of the runtime modules;
execution is owed (classifier down).