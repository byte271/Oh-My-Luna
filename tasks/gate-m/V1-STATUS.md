# Gate M V1 — status record

This file is a status record **about** V1. It adds no claim to V1 and changes
nothing inside it. V1's packets, review export, policy, thresholds, hashes and
freeze are preserved exactly as authored.

```
freeze_id:          gate-m-real-tasks-2026-08-02-pre-review-v1
integrity_status:   intact
execution_status:   disabled
scientific_status:  superseded_before_policy_review
superseded_by:      gate-m-real-tasks-v2
```

**V1 is not corrupted.** Its integrity is exactly what makes it useful: a
reproducible record of a protocol that was rejected on methodological grounds
before it ever produced a result. Nothing about it should be deleted.

## Integrity

Verified at commit `b6411dc`: **157 of 157 freeze-bound artifacts matched, 0
mismatches.** Aggregate identity
`8bf287479404f5ee933c0bd69b9c08ce26c43ed29e64e35309f34afd9e572988`;
freeze file `7d4ea75fbec0ebfa6fcb7eb8241a7f7d49e0456873cb316fcdea8700dc90e321`.

### Deliberate divergences

From commit `af17aec` onward, **`package.json` no longer matches its
freeze-bound hash**:

- bound by V1: `efc11bf4f03e111ff7f1df39874a7e9197e4291dbaf2cc79c3cc168dd5763d9d`
- current: differs, because the Gate M entry points were added — first
  `gate-m:provision` and `gate-m:setup`, later `gate-m:treatments`,
  `gate-m:leakage`, `gate-m:kernel` and `gate-m:freeze-v3` under protocol V3

From the Gate H branch onward a second bound artifact also diverges:

- `src/errors.ts`, which gained `OML_BUDGET_INVALID`, `OML_BUDGET_EXCEEDED`,
  `OML_PROVIDER_CREDENTIAL_MISSING`, `OML_PROVIDER_LIVE_EXECUTION_BLOCKED` and
  `OML_PROVIDER_RESPONSE_INVALID` for the live provider adapter.

Both divergences are intentional and additive. V1's headline validation command
did not reproduce from a clean clone; fixing that required a script entry point.
Clean-clone reproducibility outranks the hash of a protocol version superseded
before any policy-eligible review, and a superseded freeze cannot be allowed to
forbid new error codes in shared source.

**V1 remains byte-verifiable at commit `b6411dc`**, where all 157 artifacts
match. That commit is the citable V1 record. The freeze's mutation detection is
working correctly here — it detected exactly the change that was made.

## Why V1 was superseded

Six reasons. None is a defect in the code; all are defects in the method.

1. **Zero policy-eligible reviews.** `review-control/policy.json` requires two
   reviewers from `["human", "separately_operated_external_model"]`. None was
   ever obtained. The only review performed was by the maintainer session and is
   explicitly ineligible.

2. **Known L5 implementation disclosure.** All four L5 packets describe
   mechanism rather than behavior — a marker to carry on a result, a modifier to
   stop preserving, a lookahead condition to insert. Four of four is a
   systematic authoring pattern, not isolated slips.

3. **Incorrect date-fns L4 diagnosis.** The V1 root cause explains the November
   and December misclassification but not the two October failures, which have a
   different mechanism. Confirmed against the base run `["Invalid","Invalid",1,1]`
   and, in V2, against a stage-separating evidence probe: October fails at the
   match stage (`no_match`), while November and December match correctly and then
   fail at the selection stage.

4. **Structurally visible information levels.** The V1 review export emitted
   `{context, localization, observation, diagnosis, plan}`, so the set of present
   properties named the intended level without a reviewer reading a sentence.
   Exact-level agreement measured against that export would have measured schema
   recognition, not semantic classification.

5. **Clean-clone provisioning defect.** `npm run gate-m:validate` failed from a
   clean clone with `zod-tuple-default: stale worktree commit`. Its inputs are
   gitignored and nothing recreated them; the check had only ever passed on a
   machine holding leftover state.

6. **L3/L4 rule unevaluable.** The preregistered collapse rule compares two
   eligible reviewers. With zero, the rule could not be applied in either
   direction — neither to collapse nor to retain.

## Disposition of the maintainer's review

`research/gate-m-reviews/reviewer-a-final.sealed.json`
(`869f579f79b71163526c5c66892f5d472cb359e43934c95a7d018ccf17533290`) is retained
as:

```
non_policy_diagnostic_review
```

It may inform redesign, and it did: findings 2, 3 and 4 above come from it. It
**may not** enter reviewer agreement statistics, and it does not count toward
`required_distinct_reviewers`. `review-control/agreement.json` stays at
`reviewer_count: 0`, which is correct and should not be edited.

## Preserved artifacts

Nothing in this list may be deleted:

- `tasks/gate-m/freeze/identity.json` and every artifact it binds
- all twenty V1 packets under `tasks/gate-m/*/interventions/`
- the V1 review export, including all twenty bundles and repair diffs
- `tasks/gate-m/review-control/` — policy, schedule, agreement
- the sealed diagnostic review and its Phase 1 record
- all task manifests, provenance, licenses and evaluators
- the candidate pool and its six recorded rejections

## Relationship to V2

V2 reuses V1's four tasks, evaluators and repair diffs unchanged — those
reproduce and were never in question. V2 replaces the packet wording, the review
representation and the review policy. Every V2 packet records its V1 ancestor
hash in `derived_from`, and every difference is enumerated in
`tasks/gate-m-v2/CHANGES-FROM-V1.json`.

The V2 freeze does not depend on the V1 freeze. The link is provenance only.
