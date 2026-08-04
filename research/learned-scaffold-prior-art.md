# Learned-scaffold prior art

Retrieved 2026-08-01 from primary papers, official repositories, and official
project documentation. Exact numerical claims are limited to what the cited
source evaluated; none is treated as a GPT-5.6 Luna result.

| Work | Exact source/version | Domain and measured evidence | Implication / limitation |
|---|---|---|---|
| FastContext | Zhang, Wang, Shi, Wang, Gu, Yao, Fu, Fu; arXiv:2606.14066 v1, 2026-06-12; microsoft/fastcontext main retrieved 2026-08-01 | Trained 4B–30B read/glob/grep explorer; reports end-to-end gains up to 5.5% and main-agent token reduction up to 60% across SWE-bench Multilingual, SWE-bench Pro, and SWE-QA | Strongest support for a narrow explorer. “Up to” results, no Luna; training scripts/data were not available in the inspected release, so reproduction and cost remain open |
| SHERLOC | “Structured Diagnostic Localization for Code Repair Agents,” arXiv:2606.24820 v1, 2026 | Training-free diagnostic localization; file accuracy@1 84.33% on SWE-bench Lite and recall@1 81.27% on Verified; across 10 model/framework pairs reports mean +5.95pp end-to-end | Directly challenges training-first LunaGuide. Uses an LLM and quality filtering; independence from a stronger judge must be audited |
| Agent Retrieval Bench | Bowen Qin, Yi Xie; arXiv:2607.24882, 2026-07; GitHub eyuansu62/agent-retrieval-bench retrieved 2026-08-01 | 427 samples, 25 repos, 6 languages; compares lexical, RepoMap, embeddings, abstention, and trace retrieval | No family dominates. It deliberately measures retrieval rather than repair; gold labels may be incomplete |
| Loc2Repair | Mohammad Nour Al Awad, Sergey Ivanov; arXiv:2606.30963 v1, 2026; GitHub repository retrieved 2026-08-01 | Full 500 SWE-bench Verified; pooled baseline 44.7%, predicted localization 48.9/49.1%, gold modified files 52.4% across three repair backbones | Best causal warning: file localization helps but leaves most failures. Single realized arm per task and no Luna |
| Debug2Fix | Spandan Garg, Yufan Huang; arXiv:2602.18571 v1, 2026 | Interactive debugging for Java/Python; reports >20% improvement for some model/benchmark settings on GitBug-Java and SWE-Bench-Live | Supports runtime-observation arm. Subagent architecture and overhead may be unnecessary; “some settings” is not a universal effect |
| SWE-agent | Yang et al.; NeurIPS 2024, Agent-Computer Interfaces Enable Automated Software Engineering | Shows interface design can materially affect repository-agent performance | Absolute scores are obsolete; it does not isolate learned specialist value |
| Aider repository map | Official Aider documentation retrieved 2026-08-01 | Symbol graph plus token-budgeted ranking | Strong permanent deterministic baseline; no Luna-specific causal ablation |
| OpenHands | SDK paper arXiv:2511.03690 v2, 2026-04-22 and official repository | Event-sourced state, typed tools, replay, workspace/sandbox abstraction | Reusable kernel ideas; broad platform surface is not evidence for a capability amplifier |
| mini-SWE-agent | swe-agent/mini-swe-agent main retrieved 2026-08-01 | Minimal bash-oriented agent can be competitive on current coding benchmarks | Challenges permanent complex workflows; results depend on model and benchmark release |
| Oh My Codex | Yeachan-Heo/oh-my-codex main and npm 0.20.3 inspected 2026-08-01 | Skills, hooks, durable state, teams, worktrees, broad orchestration surface | Useful packaging/state prior art; no published Luna-specific paired ablation found |
| SkillsBench | arXiv:2602.12670 v1, 2026-02-13 | 7,308 trajectories over 84 scored tasks; curated skills +16.2pp average, software engineering +4.5pp; self-generated skills no average gain | Supports one lean curated Skill baseline and rejects generic generated-skill assumptions |
| SWE-Skills-Bench | arXiv:2603.15401, 2026; official repository retrieved 2026-08-01 | 49 skills, about 565 tasks; mean +1.2%, 39 zero-gain, some regressions and large token overhead | Strong negative evidence against broad skills as a core |
| Tool-Verifier-7B | Linzhuang Sun et al.; ACL Findings 2026, Anthology 2026.findings-acl.1647 | 3,295 curated training samples; 165 human-validated tool trajectories; reports beating Qwen2.5-72B-Instruct | Tool-use curation, not repository patch semantics; cannot authorize completion |
| AgentV-RL | arXiv:2604.16004, 2026-04; official repository retrieved 2026-08-01 | Agentic verifier training in reasoning/tool domains | Relevant to verifier research only; not evidence that learned verification beats hidden tests on repository repair |
| SmartAD | Guokai Tang, Feng Zhao; ACL Findings 2026, Anthology 2026.findings-acl.1349 | Student-friendly trajectory selection and segment-weighted loss for 1.5B/3B models on multi-hop QA and math | Supports student-specific data selection; domain transfer to Luna repository work is untested |
| Change2Task | Haomin Qi et al.; arXiv:2607.28591, 2026-07-30 | Converts repository changes into executable tasks across multiple coding families | Highly relevant task-factory prior art but too recent to treat reported generation quality as independently reproduced |
| DSPy | ICLR 2024 / stanfordnlp/dspy main retrieved 2026-08-01 | Metric-driven optimization of typed LM programs | Possible offline optimizer after a valid metric; not an intelligence source or sandbox |
| Agent Lightning | arXiv:2508.03680 and Microsoft stable docs retrieved 2026-08-01 | Trace-based SFT/RL/prompt optimization decoupled from agent runtime | Relevant only after executable tasks and causal target exist |

## Surviving novelty claim

No individual proposed component is novel. A defensible contribution could be a
student-specific causal selection loop: measure which oracle assistance changes
Luna outcomes, instantiate the cheapest matching component, and retain it only
when it beats deterministic and equal-cost controls on repository-disjoint
tasks. That contribution is presently a design hypothesis.
