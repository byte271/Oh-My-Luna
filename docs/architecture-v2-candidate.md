# Architecture V2 candidate

Status: provisional after Gate R0; no learned specialist selected. Gate H and
Gate A are now separate under ADR 0012 and `evaluation-plan-v3.md`.

Oh-My-Luna is currently a deterministic evaluation kernel for testing whether a
single, replaceable assistance function can causally improve GPT-5.6 Luna on
executable repository tasks.

## Online boundaries

| Authority | May | May not |
|---|---|---|
| Assistance function | Rank regions, propose a bounded observation or hypothesis, provide confidence, abstain | Edit, execute arbitrary commands, see hidden tests, declare completion |
| Luna adapter | Investigate within permissions, request approved observations, propose edits | See oracle/fixed patch, mutate control-plane records, approve itself, silently call Sol |
| Kernel | Materialize isolated workspace, select a pre-registered treatment, execute approved processes, hash artifacts, run hidden scorer, account cost | Infer semantic truth from a heuristic, expose hidden labels, claim behavior beyond scorer |
| Sol | Offline teacher/reviewer or explicit hybrid baseline | Appear in normal Luna-only runs |

## Data flow

The task fixture and workspace are agent-visible. Intervention packets, hidden
verifiers, fixed commits, split metadata, and label stores are control-plane
only. The kernel selects exactly one treatment field, records its hash, and
passes only that payload to the adapter. The hidden scorer receives the final
workspace without the treatment label.

## Component-selection rule

There is no permanent profiler, Guide, adaptive controller, agent swarm, or
generated-tool foundry in V2. One assistance slot is reserved. An oracle result
can identify causal headroom but cannot fill that slot. Gate A must separately
show that the smallest practical approximation beats deterministic and budget
controls. Only then may its implementation follow the useful category:

- context → deterministic combined ranker, then learned reranker only if needed;
- observation → one typed runtime probe;
- diagnosis → narrow hypothesis/observation ranker with abstention;
- verification → deterministic evidence first, adversarially tested learned
  verifier only for claims that cannot be executed;
- post-diagnosis model failure → explicit hybrid or reliability-only product.

## Current implementation boundary

The repository implements the experiment request boundary, packet hashing,
status separation, a small deterministic ranking baseline, task/trajectory
schemas, and basic leakage checks. It does not implement a live provider
adapter, security sandbox, task factory, LSP/AST index, learned model, or claim
evidence reducer.
