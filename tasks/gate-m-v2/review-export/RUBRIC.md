# Blinded intervention review rubric (V2)

Classify the **strongest** information the bundle actually contains, judged from
the sentences themselves. Nothing in the bundle's shape indicates a level: every
statement is emitted in the same form, in a randomized order, under an opaque
identifier. Two bundles with the same number of statements are not necessarily
the same level, and the order of statements carries no meaning.

## Levels

- **L1** — Relevant regions. Repository-relative paths and bounded base-version
  line ranges only. No causal explanation, runtime observation, diagnosis,
  repair objective, or implementation guidance.

- **L2** — Localization. L1 plus symbols visible in the base version, the failing
  interface or boundary, and caller/callee or data-flow relationships visible in
  the base version. No decisive runtime observation, causal explanation, repair
  objective, or implementation guidance.

- **L3** — Raw observation. Prior information plus reproducible execution facts:
  observed values, ordering, state, exit codes, trace events. **No explanation of
  why the observation causes the defect**, no causal diagnosis, no repair
  direction, no implementation guidance.

- **L4** — Diagnosis. Prior information plus a causal explanation of why the
  observed behavior violates intended behavior. No exact code edits, replacement
  expressions, line-by-line instructions, corrected-version-only identifiers, or
  close paraphrase of the correction.

- **L5** — Behavioral objective. Prior information plus the required behavioral
  change, constraints, non-goals, and compatibility requirements. **No concrete
  implementation, exact replacement text, exact condition to insert,
  corrected-version-only identifiers, or evaluator-only information.**

Use `L3_L4_indistinguishable` when an observation cannot be meaningfully
separated from causal diagnosis on the frozen wording.

Use `mixed` when a bundle combines incompatible levels or discloses
implementation information.

## The L5 test

For any bundle you classify as L5, ask: **could two materially different
implementations satisfy these statements?**

If the answer is no — if the statements admit essentially one implementation —
the bundle is probably describing *how* rather than *what*, and should be
recorded as implementation disclosure regardless of how it is phrased.

Statements that name a field to add, a flag or marker to carry, a branch to
insert, a modifier to change, or an internal representation to alter are
implementation disclosure even when written as prose.

## The L3/L4 boundary

L3 reports **what happened**: values, ordering, state, output, failure events.

L4 explains **why it happened**: the causal mechanism, the violated assumption,
why the L3 facts produce the reported behavior.

A statement that reports an observation and then explains its significance is
L4. If you cannot separate the two on the wording given, say so — that is a real
finding about the protocol, not a failure to decide.

## Per-statement findings

For every statement, flag any of: information from a later level, identifiers
that exist only in the corrected version, hidden evaluator details, patch-like
wording, unnecessary specificity, or close similarity to the repair.

Record findings against the `item_id` of the statement concerned. Every
non-approval needs at least one concrete statement-level finding.

**Do not propose the software fix.** You are reviewing the information boundary,
not solving the task.

## Two phases

1. **Phase 1** — using only the issue, the base-version excerpt, and the
   statements, complete the `phase1` block. Then **seal it**: write it out and
   record its SHA-256 before continuing.
2. **Phase 2** — only now open `repair-comparison.patch`. Complete the `phase2`
   block and the final decision.

Do not revise `phase1` after opening the patch. The sealed hash is what makes
the two phases separable evidence rather than one impression.

## Decisions

Exactly one of `approve`, `revise`, `reject`, `collapse_levels` per bundle.

You will not see another reviewer's answers, and no bundle carries its intended
level. If you believe you can infer the intended level from something other than
the sentences, record that — it is a defect in the export.
