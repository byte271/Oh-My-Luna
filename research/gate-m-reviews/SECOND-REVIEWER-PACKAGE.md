> **ARCHIVED — NOT ACTIONABLE.**
>
> Independent semantic review was removed as a project requirement by
> project-owner decision on cost and operational-burden grounds
> (`tasks/gate-m-v3/review-policy.json`, `gate-m-research-policy/3.0.0`).
> Review is now optional external audit evidence, not a merge gate or execution
> prerequisite. **Do not act on this document, and do not seek reviewers.**
>
> It is kept because it records what the V2 round would have required and why
> zero eligible reviews were ever obtained. The V2 export it describes still
> exists and still verifies; nothing here has been deleted or rewritten.

# Policy-eligible reviewer package (protocol V2)

Gate M needs **two** reviews from `["human", "separately_operated_external_model"]`
(`tasks/gate-m-v2/review-control/policy.json`).

**Current count: 0 of 2.**

The maintainer's sealed review in this directory was performed against the **V1**
export and is `non_policy_diagnostic_review`. It is not eligible, it is not a
head start, and one further review would produce 1 of 2, not completion. Both
reviewers described below are still required.

Review the **V2** export. The V1 export is superseded: its bundle shape revealed
the intended level mechanically, so any classification made against it measured
schema recognition rather than reading.

## What to hand each reviewer

Exactly this subtree, and nothing else:

```
tasks/gate-m-v2/review-export/
├── README.md
├── RUBRIC.md
└── bundles/gm2-*/          (20 bundles)
    ├── bundle.json              issue, base excerpt, uniform statements
    ├── repair-comparison.patch  PHASE 2 ONLY — withhold during Phase 1
    └── answer-template.json     blank form
```

Export it without touching the frozen originals:

```sh
git archive HEAD tasks/gate-m-v2/review-export | tar -x -C <reviewer-dir>
```

Give the two reviewers separate copies. They must not share a workspace.

## What no reviewer may receive

- `research/gate-m-reviews/` — the maintainer's diagnostic review.
- `tasks/gate-m-v2/review-control/` — **contains `bundle-mapping.json`, which is
  the packet-to-level answer key.** Handing this over destroys the round.
- `tasks/gate-m-v2/*/interventions/` — the typed packets, which carry
  `intervention_level` directly.
- `tasks/gate-m-v2/freeze/` — contains the ordering seed hash and bundle order.
- Any task `control/` directory — evaluators, `known-repair.patch`, evidence probes.
- Any `reviews/author-record.json`; the whole of `tasks/gate-m/` (V1).
- Git history, PR discussion, this file, the other reviewer's output.

## Integrity values to confirm before starting

| Item | SHA-256 |
| --- | --- |
| `review-export/RUBRIC.md` | `3c2658c86bced2c0b6483a370b67df94aa21e907e14d52339a0dc145fabd14d8` |
| `review-control/policy.json` | `d4b582a28df736527f612205d1087b03791dd2072b610893eddedfe34399f78f` |
| V2 freeze `identity.json` | `ed481406b4bac2221f795d93b81d396925c0f066ab13b22a07f0007a10f1640f` (aggregate) |

Regenerate rather than trust if any differ:
`node scripts/gate-m/freeze-v2.mjs --verify` must report
`checked=106 mismatched=0`.

## Procedure

1. **Phase 1 — no patch access.** Using only `bundle.json` and `RUBRIC.md`,
   complete the `phase1` block: level, second-best level, confidence, whether
   later-level information is present, whether L3 and L4 are separable,
   per-statement findings keyed by `item_id`, and an initial decision.
2. **Seal Phase 1.** Write it out and record its SHA-256 **before** opening any
   `repair-comparison.patch`. Set `phase1.sealed_before_comparison` to that hash.
3. **Phase 2 — patch access.** Record repair similarity, corrected-version-only
   identifiers, implementation disclosure, evaluator-only information, whether
   the bundle effectively solves the task, and the final decision.
4. **Do not edit Phase 1 afterward.**
5. Every non-approval needs at least one concrete statement-level finding.
   Do not propose the software fix.

## Record to return

Per bundle: `bundle_id`, the sealed Phase 1 hash, the Phase 1 and Phase 2 blocks,
and `final_decision`.

Per reviewer: `reviewer_id`, `reviewer_class`, operating context, isolation
method, rubric hash, bundle hashes, start and finish time, the hash of the
returned record, and known limitations.

## Known limitation each reviewer should be told

The corpus is cumulative, so statement count correlates with level — L5 is 14
statements on all four tasks. This is disclosed in the export README. Classify
from the sentences; if you find yourself counting, record that in your
limitations. The policy preregisters a count-only baseline that reviewer
agreement must beat before it can be called semantic.

## Eligibility, stated plainly

A model session qualifies as `separately_operated_external_model` only if it is
genuinely separately operated: a distinct session with no access to this
repository beyond the exported subtree, no access to the maintainer's review or
the other reviewer's, and no involvement in authoring the packets.

Explicitly **not** eligible: the maintainer session, any subagent spawned by it,
a second pass by an existing reviewer, or any reviewer that has seen intended
labels. `policy.json` also records
`model_review_not_equivalent_to_human_review: true` — at least one human
reviewer remains strongly preferable.

If only one eligible reviewer is available, record **1 of 2** and keep the gate
blocked. Do not synthesize the second.
