# Gate M protocol V3 — simplified treatments, reviewer-free

```
protocol_version: gate-m-treatments-v3
freeze_id:        gate-m-treatments-v3-2026-08-02
status:           ready_for_exploratory_gate_h
supersedes:       gate-m-real-tasks-v1, gate-m-real-tasks-v2  (both preserved unmodified)
```

## Policy change

Independent semantic review has been removed as a requirement by project-owner
decision, on grounds of cost and operational burden.

> Independent semantic review is optional external audit evidence.
> It is not a merge gate or execution prerequisite.

V1 and V2 both required two policy-eligible reviewers. **No eligible review was
ever completed.** The requirement was not retired because it turned out to be
unnecessary — nothing was learned that made it redundant. It was retired because
its cost is not justified at this stage. That distinction matters, and removing
the requirement removes a source of evidence the project no longer has.

The consequence is carried in the claims, not hidden: every packet is
`author_reviewed_semantic_separation_unverified`.

Prior review attempts and eligibility failures remain archived under
`research/gate-m-reviews/` and no longer block development.

### Vocabulary

Permitted: *author-reviewed*, *mechanically validated*, *exploratory
intervention*, *semantic separation unverified*.

Forbidden: *independently validated*, *reviewer agreement*, *proven semantic purity*, *reviewer-approved*.

`validate-kernel.mjs` checks V3 material for this vocabulary and fails the gate
if it appears outside a line declaring it forbidden.

## Treatment design

The five-level L1–L5 ladder is retired as the primary design. It was not
retired for being wrong but for being unmeasurable at acceptable cost:
statement count tracked level, L3 and L4 resisted separation, L5 wording kept
drifting into implementation guidance, and authoring cost was high. Without
independent review there is no mechanism that could have resolved any of that.

| Arm | Name | Contents |
| --- | --- | --- |
| **T0** | native | Original task only. No packet exists. |
| **T1** | bounded context | Relevant files, bounded regions, base-state symbols. |
| **T2** | execution evidence | T1 plus raw reproducible observations from the base state. |
| **T3** | diagnostic assistance | T2 plus author-produced causal diagnosis **and** behavioral objective. |

**T3 is deliberately a combined arm.** Diagnosis and behavioral objective are
not isolated from one another. If T3 shows an effect, that effect may **not** be
attributed to diagnosis rather than planning, or the reverse. Separating them is
a later question, and only worth paying for if T3's gain is large.

L3-versus-L4 agreement analysis is discontinued. The old packets, exports,
policies and freezes are preserved as research history and are not edited in
place.

## Leakage controls

With no independent review, the only remaining guards are mechanical. They are
heuristics over wording and token overlap. **They cannot establish semantic
purity and are never reported as if they do.**

Every T3 packet is checked for: exact patch text, corrected-version-only
identifiers, line-by-line edit instructions, exact replacement expressions,
evaluator-only details, references to the corrected commit, a missing
multiple-implementations justification, and token similarity to the known repair.

Measured similarity to the known repair (Jaccard over code-ish tokens):

| Task | T1 | T2 | T3 |
| --- | --- | --- | --- |
| `zod-tuple-default` | 0.018 | 0.068 | 0.170 |
| `zod-absent-catch` | 0.086 | 0.068 | 0.083 |
| `date-fns-zh-month` | 0.000 | 0.029 | 0.020 |
| `type-fest-conditional-keys` | 0.167 | 0.086 | 0.047 |

Exclusion threshold for T3 is **0.5**, registered before the numbers were known.
No task exceeds it, so no task is excluded.

**On failure the task is excluded from T3, not reworded.** Rewriting a packet
repeatedly until it clears a similarity threshold fits the corpus to its own
detector, which would be worse than having no detector.

The detector was itself tested against deliberately leaky content: exact patch
text, a corrected-only identifier (`caught`), a corrected commit reference, and
an edit instruction were each injected and each caught. An earlier version
produced false positives by treating English words in patch *comments* as
identifiers; comments are now stripped before identifier analysis.

## Gate M kernel

Gate M now validates mechanical research integrity only. Reviewer count and
reviewer approval are not pass conditions.

`npm run gate-m:kernel` checks: documented provisioning commands, deterministic
source cache, exact task source identities, base-fail/corrected-pass, evaluator
repeatability, three repositories represented, treatment-specific
materialization (including that T0 has no packet), absence of corrected patches
from model-visible material, leakage controls, frozen identities, receipt
integrity and deterministic failure handling, cost-accounting evidence, and
absence of forbidden claim vocabulary.

Pass verdict:

```
method_kernel_valid_with_unreviewed_semantic_interventions
```

**Permits:** merging PR #1, running an exploratory Gate H pilot.

**Does not permit:** any strong causal claim about fine-grained information
levels; attributing a T3 effect to diagnosis rather than behavioral objective;
any Luna capability, Sol comparison, or product claim.

## Clean-clone workflow

```sh
npm ci
npm run gate-m:provision
npm run gate-m:validate
npm run gate-m:kernel
```

Provisioning verifies each pinned commit against its expected `git archive`
hash and the compiler against both published digests, and fails closed with
distinct codes. Validated on Node v22.22.2 and v24.18.1.
