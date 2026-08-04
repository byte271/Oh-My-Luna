# ADR 0001: Runtime language

## Context

The runtime must integrate with Codex plugins/MCP, package as one CLI, handle
cross-platform paths/processes, validate schemas, and optionally use strong
Python debugging/AST libraries.

## Options

1. TypeScript only.
2. Python only.
3. TypeScript control plane with isolated reviewed Python helpers.
4. Rust control plane with language helpers.

## Evidence

Official Codex plugin/MCP examples and the OpenAI Agents SDK support a strong
TypeScript path. Oh My Codex is a Node/TypeScript product with selective Rust
helpers. DSPy, Python AST, pytest, and PDB favor Python for some capabilities.
V0 does not need Rust performance or a multi-language build burden.

## Decision

Use TypeScript on Node 20+ for the trusted control plane. Use Python helpers
only behind typed capability contracts and only where Python ecosystem value is
measured.

## Consequences

One npm-distributed CLI and natural plugin/MCP integration; contributors can
inspect a familiar control plane. Python helper environments and versions must
be pinned separately.

## Rejected alternatives

Python-only weakens direct plugin packaging and JS/TS repository integration.
TypeScript-only would force inferior Python debugger/AST reinvention. Rust adds
cost before performance is a bottleneck.

## Reversal conditions

Reverse if profiling shows Node process overhead is material, official runtime
integration becomes Python-only, or cross-platform sandbox control requires a
native core that cannot be isolated behind an adapter.

