# Held-out mini-pilot — plan

```
status:       planned; corpus NOT built, NOT frozen, NOT executed
live calls:   0
branch:       research/gate-h-held-out-pilot (not yet created)
```

The contaminated four-task fixture cannot produce a capability signal. This is
the corpus that could — and it does not exist yet. Nothing in this document is a
result.

## What "held out" means here, exactly

A task is held out if it was **not used** for any of:

- protocol design;
- adapter development;
- prompt tuning;
- leakage-detector tuning;
- any prior model run.

Task authors **may** inspect the known correction in order to build the
evaluator and author T1/T2/T3 material. That is unavoidable — an evaluator has
to know what correct behaviour is. Holding out is about **not having tuned the
method on the task**, not about authorial ignorance of the fix.

The four Gate M tasks fail this test on all five counts, which is precisely why
they are reclassified as a contaminated pipeline fixture.

## Corpus requirements

| Requirement | Value |
| --- | --- |
| Tasks | 4–6, none used in Gate M |
| Repositories | ≥3 |
| Defect kind | ordinary TypeScript or Python defects |
| Base state | reproducible failure |
| Corrected state | reproducible success |
| Dependencies | no external production service |
| Evaluation | bounded, offline after provisioning |
| Material | T0–T3 frozen before execution |

**No result-dependent task replacement.** Once frozen, a task that turns out
inconvenient stays in and is reported. Swapping tasks after seeing outcomes
converts a pilot into a search for a flattering subset.

## Two-stage design, preregistered

Stage B is not run unless Stage A passes. The point is to avoid spending the
full forecast merely to produce a complete table.

### Stage A — futility screen

One attempt per task per arm: T0, T1, T2, T3.

- 4 tasks → 16 attempts, forecast **$0.53**, cap $1.59
- 6 tasks → 24 attempts, forecast **$0.80**, cap $2.39

Stage A is exploratory and very noisy. A single attempt per cell cannot
distinguish a real effect from stochasticity.

**Continuation rule, frozen before execution:** continue to Stage B only if a
predefined assisted arm (T1, T2 or T3) succeeds on **at least two tasks where T0
fails**. Weaker differences do **not** count as signal, and must be reported as
no detectable signal rather than as a small positive.

**If Stage A fails, stop.** Do not proceed to Stage B to fill in the table.

### Stage B — repetition

Only on passing the continuation rule:

- two additional repetitions for **every task and every arm**, not only the
  arms that looked good;
- balanced comparison preserved;
- all Stage A and Stage B attempts reported together, including failures and
  exclusions.

Repeating only successful arms would bias the comparison, so it is prohibited.

## Freeze before execution

Tasks and source commits, evaluators and their hashes, T0–T3 material, prompts,
model alias, reasoning effort, token and cost budgets, tool permissions (none),
retry policy (none), randomization seed, schedule, pricing evidence, the
continuation rule, and this analysis plan.

## Claims permitted after Stage A/B

- A large signal was, or was not, observed on this frozen small corpus.
- Semantic interventions were author-produced and not independently reviewed.
- T3 combines diagnosis and behavioral objective and cannot be decomposed.
- The task count is far too small for a broad capability claim.

## Claims forbidden

- Luna is generally improved.
- Oh-My-Luna closes any measured fraction of the Luna–Sol gap — there is no
  matched Sol arm, and without one no fraction exists.
- Diagnosis alone caused an effect.
- Product readiness, benchmark leadership, or statistically established
  generalization.

## Prerequisites

1. PR #2 (transport) stable.
2. A separate branch `research/gate-h-held-out-pilot` and Draft PR — the
   held-out corpus must **not** be built inside the contaminated fixture's
   frozen tree.
3. Four to six genuinely new tasks located, provisioned and reproducing
   base-fail / corrected-pass.
4. Budget approved for Stage A only.
