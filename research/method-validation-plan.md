# Gate M method-validation plan

Status: mechanics in construction; produces no Luna capability claim  
Date: 2026-08-02

Gate M precedes any 12–20-task exploratory headroom pilot. It uses four to six
reviewed real tasks to test the experiment, not the product. Synthetic tasks
remain limited to negative-control and orchestration tests.

## Required demonstrations

- treatment-specific materialization exposes only the selected payload;
- hidden verifiers, fixed patches, labels, reviews, assignments, and other-arm
  traces are absent from the adapter workspace and request;
- scorer input contains no treatment identity;
- packet/task/base/design/level and all freeze hashes bind correctly;
- reviewer independence, approval, disagreement resolution, and revision
  history are enforced, while automated semantic checks remain heuristic;
- every task can be scheduled under every assigned treatment in seeded random
  order; repetitions receive distinct run IDs and all attempts persist;
- receipt 0.3 keeps run, adapter, configured-verifier, claim-evaluation, and
  terminal-evidence status separate and records model, prompt, Skill,
  intervention, task, environment, usage, billing, and cost accuracy;
- missing, stale, mismatched, leaking, tampered, timed-out, and failed inputs
  return deterministic error codes.

At least two independent semantic reviewers are required before Gate H. The
current corpus has zero independent reviews; its drafts remain unschedulable.
Passing synthetic fixtures or automated checks establishes only mechanical
enforcement; it cannot validate reviewer agreement, semantic purity, model
behavior, or product value.

## Exit

Gate M passes only when four to six real task bundles execute across their frozen
treatments, the confidentiality checks are independently inspected, semantic
review agreement is recorded, and failure injection produces the registered
codes. Otherwise PR #1 remains a research draft.
