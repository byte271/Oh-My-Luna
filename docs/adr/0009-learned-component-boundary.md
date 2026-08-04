# ADR 0009: Learned component has advisory-only authority

Status: conditional, 2026-08-01

## Context

A learned specialist may anchor Luna incorrectly, leak training data, or forge
confidence. It need not edit or execute to answer a ranking question.

## Options

Give a specialist full agent authority; permit bounded advice and allowlisted
observation requests; or prohibit learned components.

## Evidence

Agent Retrieval Bench finds no universally dominant retrieval family.
Tool-Verifier evaluates general trajectory quality but not patch truth.
SkillsBench records regressions from assistance. These results make abstention
and harmful-guidance measurement mandatory.

## Decision

If justified, the first learned component may rank regions, hypotheses, or one
allowlisted observation; emit calibrated confidence; and abstain. It may not
edit, execute arbitrary commands, see secrets/hidden tests, mutate evidence,
declare completion, or invoke Sol.

## Consequences

The kernel owns permissions and execution. Luna may challenge or ignore advice.
Every output is logged as untrusted assistance. Narrow tasks permit smaller,
cheaper models and clearer attribution.

## Rejected alternatives

A general diagnostic agent is rejected for V0; it combines multiple objectives
and obscures failure. Unrestricted execution is rejected as unnecessary risk.

## Reversal conditions

Expand authority only after a bounded advisory component succeeds and a paired
test proves that additional authority adds held-out end-to-end value without
violating the trust model.
