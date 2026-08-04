# Gate M independent review round

## Status

**One advisory review completed. Zero policy-eligible reviews completed.**
Gate M remains blocked. Treatment execution remains disabled.

> **This review was performed against the V1 export, which has since been
> superseded by protocol V2** (`tasks/gate-m-v2/`). It is retained as
> `non_policy_diagnostic_review`: it may inform redesign — and it did, since
> findings 2–4 in `tasks/gate-m/V1-STATUS.md` come from it — but it may not enter
> agreement statistics and is not a partial credit toward the two required
> reviews. Eligible reviewers must review **V2**.
>
> One caveat below is now itself superseded: the "blinding limitation that
> matters" describes the V1 structural cue, which V2 removes. The residual cue in
> V2 is statement count, disclosed in the V2 export README.

`tasks/gate-m/review-control/policy.json` requires two distinct reviewers drawn
from `["human", "separately_operated_external_model"]`. Reviewer A below is
neither, so it **does not count toward that requirement** and
`tasks/gate-m/review-control/agreement.json` is deliberately left at
`reviewer_count: 0`.

| Record | SHA-256 |
| --- | --- |
| `reviewer-a-phase1.sealed.json` | `fbe83f337b64249a16787c2300907b6c0569459226429fac0face38a7575169c` |
| `reviewer-a-final.sealed.json` | `869f579f79b71163526c5c66892f5d472cb359e43934c95a7d018ccf17533290` |

Both files are immutable. Any edit invalidates the hash and the record.

## Reviewer A eligibility (honest declaration)

- **Class:** model session that subsequently acted as repository maintainer.
- **Eligible under the frozen policy:** **no.** The policy accepts `human` or
  `separately_operated_external_model`. Reviewer A was not separately operated:
  the same session later performed the engineering work in this branch.
- **Counts toward `required_distinct_reviewers: 2`:** **no.**
- **Author conflict:** none. Reviewer A did not author the packets
  (`author_may_review: false` is satisfied), but that is not sufficient for
  eligibility.

### Protocol actually followed

- Phase 1 was completed, written, and SHA-256 hashed **before** any
  `repair-comparison.patch` was opened. Phase 1 content was not edited afterward;
  the final record embeds the Phase 1 hash.
- Material read before sealing: `tasks/gate-m/review-export/` only.
- Material **not** read before sealing: author records, `review-control/`,
  git history, PR #1 discussion, and any packet-to-level mapping.

### Blinding limitation that matters

The packet payload schema is **cumulative**, so the set of present sections
(`context`, `localization`, `observation`, `diagnosis`, `plan`) determines the
intended level structurally. Level identification was therefore near-mechanical
and **exact-level agreement between reviewers will be near-100% for reasons that
have nothing to do with reviewer skill.**

Do not report exact-level agreement as evidence that the levels are
well-separated. The informative signals are the wording-level ones: disclosure
findings, repair similarity, and approve/revise disagreement. A future protocol
version should randomize or mask section presence if exact-level agreement is
meant to carry evidential weight.

## Reviewer A result

20 packets, each seen exactly once. 4 tasks x 5 levels.

| Decision | Count |
| --- | --- |
| approve | 15 |
| revise | 5 |
| reject | 0 |
| collapse_levels | 0 |

**L3/L4 separability: L3 and L4 were distinguishable on all four ladders.** In
every ladder the L3 statement is purely behavioral (observed outputs, exit
codes, compiler diagnostics) and the L4 statement adds mechanism. Reviewer A
therefore does **not** recommend collapse. Under the frozen rule
(`exact_agreement_threshold: 0.8`, collapse if below) this is one input only;
the decision requires two eligible reviewers.

### The five packets Reviewer A would not schedule

Under the conservative packet policy, a `revise` finding blocks scheduling.

1. **`gm-c8319a153dc6dda2` (date-fns, L4) — incomplete/partly wrong diagnosis.**
   The root cause explains only the November/December misclassification
   (unanchored numeric alternative). October fails for a *different* reason:
   `matchMonthPatterns` requires a suffix (`十[二一]`) so bare `十月` never
   matches, and `1[12]` excludes `10`. These are missing alternatives, not "a
   shorter token winning". **Independently confirmed by the base-run output
   `["Invalid","Invalid",1,1]`:** the two `Invalid` entries are the October
   non-match the diagnosis does not cover.

2. **`gm-f8fb9e6e81a35927` (date-fns, L5) — implementation disclosure.**
   "Do not consume digits beyond a complete one-digit month token" is the
   negative lookahead the repair inserts (`1(?!\d)`) restated in prose. L5
   forbids the exact condition to insert. Its stated scope ("abbreviated and
   wide") is also inaccurate — the repair changes `narrow` too.

3. **`gm-5a5e77a19db97a35` (type-fest, L5) — implementation disclosure.**
   "Make key selection independent of optional property modifiers" is the
   mapped-type modifier change (`-?`) in prose, describing the internal
   construct rather than the required typing outcome.

4. **`gm-0f7f687c8e2fa9a7` (zod tuple, L5) — non-goal contradicts the repair.**
   The packet says "Do not change object-property default behavior", but the
   reference repair *does* change object-property handling (`handlePropertyResult`
   gains `isOptionalIn`, plus `$ZodObject`, `$ZodObjectJIT`, `$ZodUndefined`).
   A solver obeying this non-goal is steered away from the reference correction,
   biasing the treatment for reasons unrelated to information level.

5. **`gm-6381ad9fb536272d` (zod catch, L5) — implementation disclosure.**
   "Carry enough result semantics for an optional wrapper to distinguish
   fallback substitution from an ordinary absent value" specifies the repair's
   mechanism (a marker on `ParsePayload` set by `$ZodCatch`, read by
   `handleOptionalResult`). Nothing user-visible distinguishes those two cases;
   the sentence only makes sense as internal plumbing.

Four of five findings are at L5. That is a **systematic authoring pattern**, not
five independent slips: the L5 author repeatedly described *how* rather than
*what*. If a second eligible reviewer agrees, L5 should be re-authored as a
protocol version bump, not patched in place.

### Recorded but approved

`gm-8bc4f402d6e23c1e` (type-fest, L4) has the highest repair similarity of any
approved packet: it names both constructs the repair touches. It is retained
because it states cause rather than edit, and for a one-token repair cause and
edit necessarily converge. Flagged so the second reviewer sees the risk.

## What eligible reviewers must receive

See `SECOND-REVIEWER-PACKAGE.md`. The V2 export supersedes the V1 bundles this
review was performed against; eligible reviewers must review V2.
