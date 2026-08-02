# Kill criteria

Criteria are fixed before live Gate E runs. “Development cycle” means no more
than two iterations against the development split after the initial baseline.

## Whole-thesis kill or pivot

Pivot away from a broad Luna capability runtime if any condition holds:

1. On the pre-registered high-gap task slice, the full V0 improves hidden-test
   success by less than 10 absolute percentage points over native Luna, with a
   95% interval that does not support the target after two development cycles.
2. On the aggregate held-out set, V0 yields less than 3 absolute points and no
   statistically credible reduction in false completion, user correction, or
   total cost per success.
3. More than 25% of the development gain disappears on held-out repositories.
4. Luna-only cost per successful task exceeds 50% of the same-harness Sol cost
   while reaching less than 95% of Sol's success rate.
5. Simple/localized tasks regress by more than 2 absolute points or 10% relative
   wall time without a compensating safety gain.
6. Most gain is explained by more retries: after equalizing model calls and
   token budget, less than half of the gain remains.
7. Repeated runs show severe benchmark overfitting or public-test gaming.

The 10-point criterion is deliberately limited to a high-gap slice; the current
public aggregate Luna-Sol gap is only 3.2 points, so demanding +10 everywhere
would be impossible or evidence of benchmark leakage.

## Subsystem removal criteria

- **Profiler:** remove if its chosen settings fail to beat a fixed default on
  two held-out batches or if recommendations are unstable across equivalent
  repeats.
- **Context compiler:** remove or simplify if ranked capsules do not beat a
  compact fixed repo map, or if omitted-context failures offset token savings.
- **Capability composition:** reduce to fixed macros if composition does not add
  at least 3 points on tasks requiring the composed observation.
- **Generated tools:** keep disabled if they do not beat composition by at least
  5 points on eligible tasks, if fewer than 95% pass adversarial correctness
  fixtures, or if required isolation cannot be enforced on a target platform.
- **Evidence model:** simplify if it does not cut false-completion claims by at
  least 50%, or if it increases otherwise-correct timeouts by more than 5 points.
- **Adaptive controller:** replace with a compact fixed workflow if it fails to
  improve the quality/cost Pareto frontier on held-out tasks.
- **Branching/multi-agent:** remove if equal-budget single Luna is non-inferior,
  if branches are strongly correlated, or if merge errors erase candidate gain.
- **Git history:** stop collecting by default if its ablation has no measurable
  benefit on regression tasks.
- **Runtime probes:** trigger only selectively if mandatory use hurts simple
  tasks; remove a probe whose call rate or result usage does not predict gain.

## Release claim gate

No performance claim ships unless the exact model snapshot, effort, prompt,
tool permissions, repository commits, task split, retries, timeouts, cache mode,
scorer, full per-task outcomes, costs, and sanitized traces are published.

