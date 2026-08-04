# Gate M V2 — status record

*(Kept outside `tasks/gate-m-v2/` so that tree stays byte-identical to its freeze.)*

This file is a status record **about** V2. It adds no claim to V2 and changes
nothing inside it. V2's packets, review export, rubric, policy and freeze are
preserved exactly as authored.

```
freeze_id:          gate-m-real-tasks-v2-2026-08-02-pre-review
integrity_status:   intact
execution_status:   disabled
scientific_status:  superseded_by_policy_change
superseded_by:      gate-m-treatments-v3
```

Verified at 106/106 bound artifacts, aggregate
`ed481406b4bac2221f795d93b81d396925c0f066ab13b22a07f0007a10f1640f`.

## Why superseded

Not for being wrong. V2's corrections to V1 were sound and are carried forward
into V3: the re-derived date-fns diagnosis, the re-authored behavioral
objectives, and the base-visible type-fest symbols all survive as V3 material.

V2 was superseded by a **policy change**. It required two policy-eligible
independent reviewers, and independent semantic review was removed as a project
requirement by project-owner decision on cost and operational-burden grounds
before any eligible review was completed. With no review process, V2's central
purpose — testing whether reviewers could separate L3 from L4 once the
structural cue was gone — became unanswerable.

The five-level ladder was retired with it, for reasons V2 itself documented:
statement count tracked level, L3 and L4 resisted separation, and L5 wording
kept drifting into implementation guidance.

## What V3 carries forward

- the four tasks, evaluators, repair diffs, licenses and archive hashes;
- the corrected date-fns diagnosis and its stage-trace evidence probe;
- the re-authored behavioral objectives, now folded into the combined T3 arm;
- the clean-clone provisioning work.

## What is not carried forward

- the L1–L5 ladder, replaced by T0–T3;
- the neutral review export and its rubric, which have no consumer without
  reviewers;
- the 0.8 L3/L4 collapse rule and the preregistered count-only confound check,
  both of which required reviewer output to evaluate.

Those artifacts remain in place and still verify. They are history, not dead
weight: they record a protocol that was correct in construction and defeated by
resourcing.

## Preserved artifacts

Nothing under `tasks/gate-m-v2/` may be deleted, including the twenty neutral
review bundles, the rubric, the bundle mapping, the policy, and the freeze.
