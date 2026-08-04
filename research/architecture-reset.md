# Architecture reset

Status: pre-registered research direction, not a demonstrated architecture  
Date: 2026-08-01

## Falsification verdict

**Verified repository fact:** the implemented system is an evaluation kernel.
It does not contain a component that discovers missing hypotheses or diagnoses
repository failures. See `repository-truth-audit.md`.

**Rejected assumption:** the handoff's proposed 5:1 Sol/Luna token-price ratio.
The official pages retrieved on 2026-08-01 support 25:1 for standard text input,
cached input, and output. The canonical values are in
`data/pricing/openai-2026-08-01.json`.

**Design hypothesis:** externally supplied information can improve Luna, but
the useful information class is unknown. A learned diagnostic coprocessor is
therefore premature.

## Strongest surviving design

The smallest justified system now has three authorities:

1. a deterministic experiment kernel that isolates work, records treatment and
   model metadata, executes hidden scorers, hashes artifacts, and accounts cost;
2. one replaceable assistance function selected only after oracle interventions
   identify the causal bottleneck;
3. Luna as the sole normal-mode patch author.

No assistance function is core yet. The candidate order is deterministic
repository ranking, runtime observation, narrow learned ranking, narrow learned
diagnosis, then explicit hybrid escalation. Each later option must beat the
earlier one under equal total cost.

## Intelligence-source test

An assistance function counts as an intelligence source only if it produces an
observation or ranking not already available from the fixed harness and causes
a paired held-out end-to-end success. Better formatting, additional retries,
and completion gating do not satisfy this definition.

## Rejected for now

| Candidate | Strongest objection | Discriminating experiment |
|---|---|---|
| General LunaGuide | It may reproduce a repo map and can anchor Luna incorrectly | Oracle ladder, then compare with deterministic ranker and training-free SHERLOC-style localization |
| Trained file reranker | Gold-file context may close only a small fraction of failures | Oracle-context arm; proceed only if end-to-end lift is material |
| Trained process verifier | Deterministic hidden tests are stronger where available; learned verifiers can be gamed | Adversarial false-positive suite after deterministic verification ablation |
| Multi-agent search | Gains may be retries purchased at higher cost | Equal-total-cost Luna arm |
| Dynamic tool generation | No bottleneck currently requires new executable code | Compare fixed probe and declarative composition first |
| Full scaffold | Attribution is impossible before any component works | One-component paired ablation |

## Reversal conditions

This reset is reversed only by measured, repository-disjoint evidence. A new
component must improve requested-behavior success, not merely retrieval recall,
and must retain an economically meaningful advantage over the same-harness Sol
baseline.
