# Oracle semantic leakage

Status: active threat analysis  
Date: 2026-08-02

## Threat

An oracle packet can solve the task while being labeled as a weaker information
category. JSON shape cannot prevent this. A leaked oracle inflates causal
headroom and can select the wrong product mechanism.

## Controls

- One treatment-specific packet file, never a superset with unused fields.
- Exact component-set enforcement for cumulative and independent designs.
- Packet content self-hash plus file hash in the frozen experiment manifest.
- Separate review record with author, reviewer, disagreement, revisions, and
  final decision.
- Base-state validation for paths and identifiers.
- Hidden-path, hidden-test-name, fixed-only-identifier, commit-message, patch
  overlap, code-shape, repair-language, and causal-language heuristics.
- Model request contains assistance but not the treatment label.
- Scorer interface receives neither assistance nor treatment identity.

## Heuristic limitations

Words such as “add” can occur in an innocent raw log, while a sophisticated
diagnosis can avoid every forbidden keyword. Token similarity can miss a
paraphrased solution and can over-flag ordinary repository vocabulary. A clean
automated report therefore means only “no implemented heuristic fired.” It is
not evidence that the packet is semantically clean.

## Reviewer decision rule

Review the information a competent repairer can infer, not only literal wording.
If an observation identifies the faulty authorization mechanism, it is a
diagnosis. If a diagnosis makes one concrete condition or edit the obvious
prescribed action, it is a plan or patch hint. If a plan identifies where and
how to edit, it is implementation guidance and is rejected from all Gate H
levels.

## Falsification condition

If independent reviewers cannot reliably distinguish L3 observation from L4
diagnosis on Gate M packets, collapse those levels into one “decisive diagnostic
fact” treatment. A valid shorter ladder is preferable to nominal precision.
