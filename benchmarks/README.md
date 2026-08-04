# Benchmarks

No project benchmark result exists yet.

The deterministic task in `fixtures/smoke` tests the Gate C harness contract only. It must not be counted as Luna, Sol, fixed-Skill, or Oh-My-Luna performance.

`Luna-example/` is likewise **not** a benchmark result and must not be reported as one. It is an untracked sample of two implementations of one greenfield spec, produced outside this harness: no freeze, no leakage check, no evaluator, no receipt, no cost record. It has n=1 per arm, records no model identity, reasoning effort, timestamp or token count, and its "tests pass" claim is self-reported by both arms and unexecuted. Which arm used the skill is an owner assertion. The analysis in `research/luna-example-framevault-ab.md` is a reading of the code, and it supports no claim that the skill helps, hurts, or does nothing.

Its one project-level use is negative: it shows that a pass/fail success criterion can miss a real defect entirely. See `docs/gate-h-heldout-v2-plan.md` §8. A future benchmark that scores only `evaluator_exit === 0` inherits that blind spot, so any result reported against it must say what class of defect it could not have detected.

The first controlled experiment is specified in `docs/evaluation-plan.md`. Every published result must include a pinned repository commit, exact model snapshot and effort, treatment, retry policy, token budget, permissions, isolation backend, hidden verifier, raw redacted trace, cost, and wall time. Development tasks and held-out tasks must be reported together.
