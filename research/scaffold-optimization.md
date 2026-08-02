# Scaffold optimization

## Rejected default

A permanent plan/research/implement/review/QA swarm is rejected for V0. It adds
tokens, synchronization, merge conflicts, and correlated failure without first
showing marginal value. OpenAI's current guidance recommends lean prompts and
task-relevant tools; mini-SWE-agent demonstrates that a compact loop can remain
competitive; sequential scaling research reports context ceilings and possible
degradation.

## Surviving controller

The controller chooses the smallest pre-registered template whose entry
conditions match the Task IR. It does not invent an unrestricted workflow at
runtime.

| Template | Entry condition | Required stages | Optional branch |
|---|---|---|---|
| `direct` | localized change, deterministic oracle already known | inspect -> patch -> requirement-specific verify | none |
| `reproduce` | behavioral bug or regression | reproduce/refuse -> localize -> patch -> compare before/after | high-level runtime probe |
| `ci_failure` | failing command/log and repository available | normalize failure -> reproduce target check -> patch -> rerun target + regression set | compatibility matrix |
| `security_boundary` | auth, parsing, permissions, path, or untrusted input | map trust boundary -> negative control -> patch -> adversarial verify | isolated critic only if rubric is objective |
| `compatibility` | OS/runtime/version divergence | build matrix -> identify inconsistent assumption -> patch -> run available cells + record unavailable cells | remote CI evidence |

Every template has a strict maximum model-call, tool-call, wall-time, and retry
budget. The controller may move to a more expensive template only after recording
the failure signal that justifies it.

## Optimization hierarchy

1. Remove irrelevant prompt text and tools.
2. Improve deterministic observation quality.
3. Change the context capsule.
4. Add or change a Tier-1 capability.
5. Change the fixed template.
6. Add one independent branch with an objective merger.
7. Search workflows offline.

This ordering favors interpretable causal changes. Multiple simultaneous
changes are not accepted into the runtime profile.

## Profiler output

The profiler emits a signed/versioned record such as:

```json
{
  "model_snapshot": "gpt-5.6-luna",
  "profile_version": 1,
  "selected": {
    "error_envelope": "typed-v1",
    "capsule_budget_range": [6000, 14000],
    "retry_limit_by_failure": {"transient": 2, "deterministic": 0},
    "edit_gate": ["reproduce", "security_boundary"],
    "branching": "off"
  },
  "evidence": ["eval-run-sha256:..."],
  "valid_until": "next-snapshot-or-90-days"
}
```

The example is a schema illustration, not a measured Luna profile. Settings
enter it only after held-out improvement or non-inferior quality with lower cost.

## Offline optimization

DSPy or Agent Lightning may later optimize prompts or policies from stored
traces. ADAS/AFlow-style workflow search may later explore templates. All are
development-time systems with fixed train/dev/test separation. Their output is
reviewed and re-evaluated before release; the user's runtime never launches an
open-ended optimizer.

## Multi-agent rule

Branching is allowed only when all conditions hold:

- branches have non-overlapping questions or intentionally diverse hypotheses;
- each branch has a bounded budget;
- results are merged by a deterministic oracle or an independently evaluated
  verifier;
- the paired ablation beats a single Luna run on held-out tasks after total cost
  and latency are included.

Repeated identical Luna samples do not count as architectural diversity.

