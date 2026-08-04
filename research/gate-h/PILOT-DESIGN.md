> **RECLASSIFIED — `contaminated_pipeline_fixture`, execution disabled.**
>
> The 48-attempt design below is retained as history and remains reproducible,
> but it is **disabled as capability evidence**
> (`tasks/gate-h/fixture-control.json`). Its four tasks were used while
> developing the intervention method, the packet wording, the evaluators, the
> leakage checks and Gate M mechanics, so they are not held out from anything.
> It may be used only to verify orchestration.
>
> A capability signal requires the separate held-out corpus described in
> `research/gate-h/HELD-OUT-PLAN.md`. Do not run this fixture to obtain one.

# Gate H exploratory pilot — frozen design

```
status:        designed_and_frozen; NOT executed
live_calls:    0
cost incurred: $0.00
blocked_by:    provider documentation unverified; no credential; no approved budget
```

This pilot is for **signal detection and pipeline validation**. It is not a
release benchmark and it cannot produce a capability result.

## Question

Does supplying bounded context (T1), execution evidence (T2), or combined
diagnostic assistance (T3) change end-to-end task success relative to native
(T0), on this small exploratory task set?

## Design

| Parameter | Value |
| --- | --- |
| Tasks | 4 |
| Repositories | 3 (`colinhacks/zod` ×2, `date-fns/date-fns`, `sindresorhus/type-fest`) |
| Arms | T0 native, T1 bounded context, T2 execution evidence, T3 diagnostic assistance |
| Repetitions | 3 per task per arm |
| Total attempts | 48 |
| Model | `gpt-5.6-luna` |

Repetitions measure stochasticity of the same task. They do **not** create
additional independent tasks, and the analysis treats task as the unit.

### The confound that limits this pilot

These are the four Gate M development tasks. Their packets, diagnoses and
behavioral objectives were authored while building the method, against known
repairs. **Any effect measured here is therefore not a clean capability
estimate** — it is contaminated by development on the same tasks.

This is acceptable for pipeline validation and for deciding whether a larger
corpus is worth building. It is not acceptable as evidence about Luna. A held-out
corpus is required before any capability claim, and no such claim may be made
from this pilot regardless of the result.

## Frozen before execution

Tasks and source commits, evaluators, T1/T2/T3 packet contents and hashes,
prompts, the model identifier, reasoning settings, token and cost budgets, tool
permissions, retry policy, randomization seed, run schedule, pricing evidence,
this analysis plan, and the minimum meaningful effect. Frozen in
`tasks/gate-m-v3/freeze/identity.json` and this document; nothing here may be
altered once the first live attempt runs.

## Primary outcomes

- evaluator success (exit 0) per attempt;
- cost per successful task;
- wall time per attempt;
- false completion — the model reports success but the evaluator fails;
- regression introduction — a previously passing check fails;
- unnecessary files changed;
- first-edit correctness.

Reported per task, per repository, and per arm, with every attempt shown
including failures and exclusions. Absolute percentage-point differences only.

## Minimum meaningful effect

With 4 tasks × 3 repetitions, **only a large effect is detectable.** Registered
before execution: an arm is treated as showing signal worth pursuing if it beats
T0 by at least **2 of 4 tasks** moving from consistently-failing to
consistently-passing (all 3 repetitions).

Anything smaller is noise at this sample size and must be reported as "no
detectable signal", not as a small positive.

No p-value will be reported. With n=4 tasks it would be theatre.

## Decision rule

| Outcome | Next step |
| --- | --- |
| T1 helps | Continue with deterministic context and localization |
| T2 adds value beyond T1 | Develop a small typed observation capability |
| T3 adds value beyond T2 | Treat diagnosis + planning as one combined target |
| No arm helps | Stop expanding intervention architecture; consider reliability, cost control, or Luna/Sol routing |

**T3 cannot be decomposed.** It combines diagnosis and behavioral objective by
design, so a T3 gain says nothing about which half caused it. Separating them is
a later question, worth paying for only if the combined gain is large.

## Cost forecast

`node scripts/gate-h/forecast-cost.mjs`, using the same cost function and
committed pricing evidence as the live adapter:

| Arm | Per turn | Attempts | Arm total |
| --- | --- | --- | --- |
| T0 | $0.01080 | 12 | $0.389 |
| T1 | $0.01100 | 12 | $0.396 |
| T2 | $0.01110 | 12 | $0.400 |
| T3 | $0.01140 | 12 | $0.410 |

**Forecast total: $1.60. Recommended hard cap: $4.79.**

Token counts are assumptions — no live call has been made. The forecast assumes
no cache hits and 3 model turns per attempt, and excludes tool charges, storage
and tier uplift. A Sol comparison arm is **not** included and is not costed.

## Execution is blocked

Three independent blockers, each requiring a human decision:

1. **Provider documentation unverified.** `developers.openai.com` is denied by
   this environment's network policy (CONNECT 403), so the endpoint shape,
   reasoning-effort values, snapshot-pinned identifiers and usage field names
   could not be checked against current official documentation. The adapter
   refuses to run without an explicit operator attestation.
2. **No credential.** None is present and none may be committed.
3. **No approved budget.** The adapter enforces caps but an operator must set
   them.

See `research/gate-h/ADAPTER-STATUS.md`.

## Forbidden regardless of outcome

- Any Luna capability claim, Sol comparison, or product-readiness claim.
- Any claim that diagnosis specifically is the causal bottleneck.
- Any generalization from 4 tasks or from repeated trials on them.
- Any attribution of a T3 effect to one of its two components.
