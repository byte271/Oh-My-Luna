# Prior art and competitive analysis

All rows describe the cited implementation or paper at the version recorded in
`sources.json`. “Evidence” means published evaluation evidence, not popularity.

## Comparison matrix

| System | Actual architecture and execution | Context/state | Extension and security | Evidence and limitations | Oh-My-Luna consequence |
|---|---|---|---|---|---|
| Oh My Codex 0.20.3 | Node/TypeScript CLI plus Rust helpers; many skills and role prompts; hooks; MCP servers; tmux/psmux teams and worktrees; workflow FSMs | `.omx/` plans, logs, memory, goal state; completion gates; capability lockfile | Codex plugin, skills, hooks, MCP; worktree isolation; primarily tuned for macOS/Linux CLI | Large tested product surface, but no published Luna-specific paired ablation located; native Windows is less supported | Reuse packaging and durable-artifact lessons. Reject role marketplace and permanent team runtime for V0. Differentiate with Luna profiles, causal ablations, typed evidence validity, and a far smaller surface. |
| SWE-agent / mini-SWE-agent | ReAct-style model loop over an Agent-Computer Interface; current maintainers recommend the much smaller mini agent | Transcript plus environment; research harness | Configurable commands; containerized benchmark environments | ACI paper proves interface shape matters. Mini agent demonstrates that simplicity can remain competitive. | Treat interface design as core; complexity has a high burden of proof. |
| Aider | Pair-programming loop with git and edit formats; repository map ranks symbol definitions and references under a token budget | Conversation plus generated repo map and git | Broad language support; local process privileges follow user environment | Clear practical context strategy, but no Luna ablation and no evidence authority | Reuse ranked structural map ideas, but combine with issue, tests, history, runtime evidence, and source hashes. |
| OpenHands V1 | Event-sourced agent SDK, immutable config, typed tools, workspace abstraction, REST/WebSocket server, local/remote sandboxes | Event stream with deterministic replay; persisted conversations/workspaces | Pluggable tools/MCP; Docker or hosted workspaces | Broad benchmark support and production experience; still has open questions around authority separation and runtime complexity | Reuse event-sourcing and harness/compute split concepts; do not depend on the platform or copy its breadth in V0. |
| DSPy | Python programs of typed LM signatures/modules plus metric-driven optimizers for prompts/weights | Program state and training/eval examples | Python modules; security delegated to application | Strong approach to offline optimization; not a sandbox or truth system | Candidate Evolution Lab dependency later; not needed to execute the first experiment. |
| LangGraph | General graph runtime mixing deterministic and model nodes | Checkpoints, thread state, stores, interrupts | Python and JS; security delegated to application/tools | Mature persistence and graph mechanics; does not define claim validity | Do not add it in V0. A tiny append-only reducer is sufficient until graph requirements exceed it. |
| Agent Lightning | Framework-independent instrumentation feeding traces/rewards to prompt, RL, or SFT optimizers | Structured spans in a training store | Integrates with existing agents; training infrastructure is separate | Useful for later optimization; operationally and computationally heavy | Keep trace schema exportable, but defer training and RL. |
| LATM | Strong model creates reusable Python tool; cheaper model calls cached tool | Functional tool cache | Python execution; safety model is not adequate for private repositories | Cost result depends on strong maker and reasoning benchmarks | Supports offline Sol-as-teacher mode, not Luna-only JIT generation. |
| CREATOR | Model separates tool creation, use decision, and optional rectification | Per-task generated program/results | Direct Python execution; dated key handling | Math/table/creation benchmarks; repository has only two visible commits | Historical support only; not a production basis. |
| ToolMaker | Agent installs a supplied scientific repository, creates wrapper code, self-corrects, and tests it in Docker | JSONL trajectory and generated tool directory | Docker plus dependency install and external credentials | 80% of 15 tasks with >100 tests; 20% failure remains | Shows value of specialized adapters but also the verification and supply-chain burden. |
| CodeAct | Model emits executable Python as a unified action language; per-session interpreter/container | Multi-turn code and observations | Docker execution is essential | Up to 20% higher success than text/JSON on its benchmarks | Code composition is useful inside a strict sandbox, but not the default control language for V0. |
| AutoTool | Trained model alternates reasoning and selection over evolving toolsets | Learned trajectory policy | Tool security outside central contribution | Gains across ten benchmarks with trained 7-8B models | Not directly applicable to a closed Luna snapshot; motivates measuring tool selection separately. |
| ADAS | Meta-agent writes new code-defined agents; archive and evaluation guide iterative search | Archive of discovered agents | Repository warns about untrusted generated code | Strong benchmark results and transfer claims; expensive search, domain customization | Development-time research option only. It cannot run in the user path before sandbox and held-out eval maturity. |
| AFlow | MCTS over code-represented workflows built from predefined operators and LM nodes | Search tree and execution feedback | Executes generated workflow code | +5.7% average across six mostly compact benchmarks; repo notes some migrated operators may be buggy | Prefer a hand-auditable template selector first. Workflow search becomes justified only after enough tasks and a safe evaluator exist. |
| AutoFlow | Generates natural-language workflow programs and iteratively optimizes them | Generated workflow and evaluation feedback | Natural-language execution semantics | Reported robust workflows, but natural language is underspecified for authorization | Reject as runtime representation; prose can explain a typed graph but not govern it. |
| A2Flow | Extracts and clusters task operators, then searches workflows with operator memory | Reusable operator memory | Generated abstractions and workflow execution | Reported gains/resource reduction on general and embodied tasks | Long-term analogue for promotion of repeated Tier-2 instruments; not V0. |
| Voyager | GPT-4 automatic curriculum, executable JavaScript skill library, environment feedback, self-verification | Vector-retrieved growing skill library | Runs skills against a stable Minecraft API | Strong transfer inside Minecraft | Reuse promotion concept only after repeated repository instruments pass review; arbitrary repos lack Voyager's stable world API. |
| SkillsBench | Containerized tasks with no-skill, curated-skill, and self-generated-skill arms plus deterministic verifiers | Full trajectories and artifacts | Filesystem skills; BenchFlow sandbox | Curated +16.2pp average; self-generated no average gain; software engineering only +4.5pp; some regressions | Directly rejects self-authored skill generation as V0 core and requires task-level non-regression checks. |
| Debug2Fix | Main coding agent calls one high-level debugger subagent; optional policy blocks edits until debugger use | Separate debug trajectory; runtime values returned to main agent | PDB/JDB hidden behind narrow interface | Strong ablations across Python/Java; direct low-level tools can harm; tool gating adds cost and can overfit | Strongest template for Tier-1 capabilities: hide complexity, expose decision-relevant observations, and activate by task class. |

## Deep inspection: Oh My Codex

The npm 0.20.3 tarball was inspected locally rather than inferred from the
README. It contains 3,275 files and about 36.5 MB unpacked. The package declares
Node 20+, Zod, TOML, and MCP dependencies; it also contains Rust crates for API,
runtime, multiplexing, exploration, and shell execution.

Concrete implementation observations:

- The plugin manifest bundles skills, hooks, MCP servers, and app metadata.
- Hooks cover session start, prompt submit, pre/post tool use, compaction, and
  stop.
- The Autopilot FSM uses named phases such as deep interview, planning,
  implementation, code review, and QA.
- Its completion gate requires distinct code-review and QA verdict records, but
  the inspected implementation primarily validates record fields and locators;
  this is not the same as verifying the linked artifact's behavior or freshness.
- A capability lockfile hashes configured tools, skills, agents, and fixture
  contracts, then checks observed tool calls for wrong or hallucinated tools and
  missing required arguments.
- The product includes dozens of skills and specialist prompts, extensive tests,
  multiple execution paths, provider advice, teams, notifications, HUDs, auth
  handling, and native helpers.

**Inference:** OMX is a useful orchestration and product-engineering reference,
but its size is the wrong starting point for a causal Luna-performance project.
Oh-My-Luna's differentiation cannot be “OMX with different prompts.” It must be
a benchmark-owned, Luna-profiled, typed capability/evidence experiment whose
components survive removal tests.

## Novelty boundary

No individual candidate component is novel:

- model-facing tools: SWE-agent and CodeAct;
- ranked repository context: Aider;
- durable graphs/state: LangGraph, OpenHands, OMX;
- generated tools: LATM, CREATOR, ToolMaker, Voyager;
- workflow search: ADAS, AFlow, AutoFlow, A2Flow;
- prompt/program optimization: DSPy and Agent Lightning;
- skill evaluation: SkillsBench;
- high-level runtime debugging: Debug2Fix.

**Design hypothesis:** possible novelty lies in a *model-snapshot-specific closed
loop* that profiles Luna, selects a minimal capability surface, compiles evidence
with explicit invalidation, and continuously removes components that fail
Luna-specific held-out ablations. This remains unproven and should not be a
release claim until Gate E.

