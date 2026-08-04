# Negative evidence ledger

Retrieved: 2026-08-01. Entries are challenges, not proof about Luna.

| Claim under attack | Primary evidence | Result | Applicability limit |
|---|---|---|---|
| Correct files solve repository repair | Loc2Repair, Al Awad & Ivanov, arXiv:2606.30963 v1 | Gold modified-file sets improved pooled SWE-bench Verified repair 44.7%→52.4%; most tasks still failed | Three non-Luna backbones; one public benchmark; file sets are an imperfect oracle |
| Learned retrieval necessarily wins | Agent Retrieval Bench, Qin & Xie, arXiv:2607.24882 | No retrieval family dominated; RepoMap led some budgeted/trace metrics while Qwen variants led others | Diagnostic retrieval study; no repair outcome |
| More skills reliably improve agents | SWE-Skills-Bench, arXiv:2603.15401 | 39/49 public skills had zero gain; mean +1.2%; some regressed and overhead reached +451% | Public skills and selected agents, not Luna |
| Self-generated skills are enough | SkillsBench, arXiv:2602.12670 | Self-generated skills had no average gain; 16 tasks regressed | Broad 84-task suite; software engineering gain was smaller than aggregate |
| A learned verifier is semantic truth | Tool-Verifier-7B, Sun et al., ACL Findings 2026 | 3,295 training samples and 165 human-validated trajectories; evaluates general tool-use quality | Does not evaluate repository patches, hidden behavioral claims, or verifier gaming |
| Executable verifier implies faithful task scoring | Verification Horizon, arXiv:2606.26300 | A verifier that fails before and passes after a fix can still be semantically unfaithful to the instruction | Recent preprint; task-construction focus |
| Distillation transfers automatically | SmartAD, Tang & Zhao, ACL Findings 2026 | Student compatibility varies; method selects student-friendly trajectories and reweights action/final spans | Multi-hop QA/math with 1.5B/3B models, not repository repair |
| More sequential inference monotonically helps | General Agent Scaling Ceiling, arXiv:2602.18998 | Sequential scaling can reach a context ceiling and degrade | Broad agent tasks; ceiling is model/task dependent |

## Consequences

1. Oracle end-to-end interventions precede retriever training.
2. Every assistance component needs an abstention path and harmful-guidance rate.
3. Deterministic hidden execution remains the primary scorer when feasible.
4. Equal-total-cost retries are a mandatory control.
5. Training data must be student-specific and executable; teacher prose is not
   automatically a trustworthy target.

## Unverified or non-supporting names

The following names were found but do not support the proposed architecture as
stated: AgentV-RL concerns agentic verification in other reasoning domains;
Tool-Verifier concerns general tool-use trajectory curation; SmartAD concerns
QA/math distillation. They remain prior art, not evidence for a Luna coding
coprocessor. No source found in this audit establishes that a small specialist
trained on another model's trajectories will generalize across repositories and
Luna snapshots.
