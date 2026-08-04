# Gate M verdict

**Verdict: `method_kernel_valid_with_unreviewed_semantic_interventions`**

Recorded under research policy `gate-m-research-policy/3.0.0`, which removes
independent semantic review as a requirement. All twelve mechanical checks pass.

**Permits:** merging PR #1, running an exploratory Gate H pilot.

**Does not permit:** any strong causal claim about fine-grained information
levels; attributing a T3 effect to diagnosis rather than behavioral objective;
any Luna capability, Sol comparison, or product claim.

## What changed, and what that costs

Independent semantic review was removed by project-owner decision, on cost and
operational-burden grounds. V1 and V2 each required two policy-eligible
reviewers; **zero eligible reviews were ever completed.**

The requirement was not retired because it proved unnecessary. Nothing was
learned that made it redundant. It was retired because it is not affordable at
this stage. That is a scope and cost decision, and it leaves a real gap: there
is now no process in the project capable of establishing that a packet's
semantic content sits where its label claims.

The gap is carried in the claims rather than papered over. Every packet is
`author_reviewed_semantic_separation_unverified`. Permitted vocabulary is
*author-reviewed*, *mechanically validated*, *exploratory intervention*,
*semantic separation unverified*. The kernel validator fails the gate if
forbidden vocabulary appears in V3 material.

## Gate M kernel — all checks pass

`npm run gate-m:kernel` on Linux x64, Node v22.22.2:

| Check | Result |
| --- | --- |
| `provisioning_documented_commands` | `gate-m:provision`, `gate-m:validate`, `gate-m:setup` present |
| `deterministic_source_cache` | 8 worktrees pinned, compiler 5.4.2 |
| `evaluator_repeatability` | 17→0, 17→0, 17→0, 2→0 |
| `three_repositories_represented` | 3 |
| `base_fail_corrected_pass` | 4 tasks, all accepted |
| `treatment_specific_materialization` | 4 tasks × T1/T2/T3; T0 native, no packet |
| `no_corrected_patch_in_model_visible_material` | no packet references repair material |
| `leakage_controls_heuristic` | 0 blocking findings, 0 tasks excluded |
| `frozen_identities` | 36/36, aggregate matches |
| `receipt_and_failure_handling_tests` | 57/57 |
| `cost_accounting_evidence` | pricing evidence hash-bound |
| `no_forbidden_claim_vocabulary` | clean |

Reviewer count and reviewer approval are **not** pass conditions.

## Treatment design

The L1–L5 ladder is retired as the primary design — not for being wrong, but for
being unmeasurable at acceptable cost: statement count tracked level, L3/L4
resisted separation, L5 drifted into implementation guidance. Without
independent review nothing could have resolved that.

| Arm | Contents |
| --- | --- |
| T0 | native; no packet |
| T1 | bounded context: files, regions, base-state symbols |
| T2 | T1 + raw reproducible observations from the base state |
| T3 | T2 + author-produced causal diagnosis **and** behavioral objective, combined |

**T3 is a combined arm.** If it shows an effect, that effect may not be
attributed to diagnosis rather than planning. L3/L4 agreement analysis is
discontinued.

## Leakage controls replace nothing

With review removed, the only remaining guards are mechanical heuristics over
wording and token overlap. They cannot establish semantic purity.

Similarity to the known repair (Jaccard over code-ish tokens), threshold 0.5
registered before the numbers were known:

| Task | T1 | T2 | T3 |
| --- | --- | --- | --- |
| `zod-tuple-default` | 0.018 | 0.068 | 0.170 |
| `zod-absent-catch` | 0.086 | 0.068 | 0.083 |
| `date-fns-zh-month` | 0.000 | 0.029 | 0.020 |
| `type-fest-conditional-keys` | 0.167 | 0.086 | 0.047 |

No task exceeds the threshold; none is excluded. On failure the policy excludes
the task from T3 rather than rewording it — repeated rewriting would fit the
corpus to its own detector.

The detector was tested against injected leaks (exact patch text, the
corrected-only identifier `caught`, a corrected commit reference, an edit
instruction); each was caught. An earlier version produced false positives by
treating English words in patch comments as identifiers.

## Preserved history

| Version | Status |
| --- | --- |
| V1 `gate-m-real-tasks-2026-08-02-pre-review-v1` | preserved unmodified; 157/157 at `b6411dc` |
| V2 `gate-m-real-tasks-v2-2026-08-02-pre-review` | preserved unmodified; 106/106 |
| V3 `gate-m-treatments-v3-2026-08-02` | active; 36/36 |

No old freeze hash was edited to match a changed file. V1's single documented
divergence (`package.json`, provisioning entry points) is unchanged and still
recorded in `tasks/gate-m/V1-STATUS.md`. The maintainer's sealed review remains
archived as `non_policy_diagnostic_review`.

## Conclusions permitted

- The mechanical kernel reproduces from a clean clone on Node 22 and Node 24.
- The four tasks are real, licensed historical defects with deterministic
  base-fail and corrected-pass behavior across three repositories.
- All three freezes detect mutation.

## Conclusions forbidden

- No Luna capability result, Sol comparison, or product benchmark.
- No claim that any packet's semantic boundary is verified.
- No attribution of a future T3 effect to diagnosis rather than planning.
- No claim about fine-grained information levels; that design is retired.

## Next decisive action

Merge PR #1, then open `research/gate-h-pilot` and build the exploratory pilot
(4–6 tasks, 3 repositories, T0–T3, 2–3 repetitions) for signal detection and
pipeline validation only.
