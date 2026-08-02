# ADR 0006: Codex plugin integration

## Context

Oh-My-Luna needs one user entry point while reusable workflow instructions and
typed capabilities map to different Codex extension surfaces.

## Options

1. Skill only.
2. Plugin containing one skill and optional local MCP server.
3. CLI wrapper only.
4. Large plugin with many roles and commands.

## Evidence

Official documentation defines skills as workflows and plugins as distributable
bundles that may include skills, hooks, and MCP. Oh My Codex demonstrates the
full bundle but also the complexity of a large surface. SkillsBench favors
focused skills.

## Decision

Ship the runtime as the `oh-my-luna` CLI. After Gate E, package one focused
`oh-my-luna` skill and the minimum local MCP capability surface. Hooks may
observe or mechanically enforce policy but do not replace approval controls.

## Consequences

One user concept, clean separation of workflow and tools, and no role picker.
Plugin creation is deferred until runtime contracts stabilize.

## Rejected alternatives

A skill cannot enforce state or execute typed capabilities alone. CLI-only loses
native discovery. A large bundle contradicts the evaluation-first thesis.

## Reversal conditions

Use skill-only if the fixed skill matches the full runtime in held-out tests.
Use CLI-only if plugin/MCP surfaces cannot preserve required sandbox controls.

