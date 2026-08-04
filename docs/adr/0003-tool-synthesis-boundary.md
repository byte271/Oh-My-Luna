# ADR 0003: Tool synthesis boundary

## Context

“Tool Foundry” could mean code generation, adapters, workflows, probes, or
verifiers. These have different risk and evidence.

## Options

1. Arbitrary generated source.
2. Generated natural-language workflows.
3. Declarative graphs over validated capabilities.
4. No task-specific instruments.

## Evidence

LATM uses a stronger maker; ToolMaker passes 80% of fifteen tasks; ADAS warns
about untrusted generated code; AFlow searches code workflows with nontrivial
cost and known migration bugs. OpenAI recommends programmatic execution for
bounded deterministic processing with explicit schemas and limits.

## Decision

Define synthesis as declarative composition by default. Generated source is a
separate experimental mode, never silently substituted.

## Consequences

Lower novelty theater, smaller attack surface, and easier causal evaluation.
Some genuinely novel observations may remain unavailable until Tier 3 matures.

## Rejected alternatives

Natural-language workflow semantics are not precise enough for authorization.
No instruments forfeits the central task-specific observation experiment.

## Reversal conditions

Enable generated source only if composition cannot express a pre-registered
task class and generation beats it under correctness/security kill criteria.

