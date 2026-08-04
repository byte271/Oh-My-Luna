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

## Amendment, 2026-08-03 — two artifacts named "skill", neither is a plugin

The original decision deferred packaging one `oh-my-luna` skill until after Gate
E. That deferral stands: **no plugin is being created.** But the word "skill" was
carrying two incompatible meanings, and conflating them would let a documentation
edit be reported as an experimental result. They are now separate files:

| File | Audience | Effect on results |
| --- | --- | --- |
| `SKILL.md` (repository root) | an agent harness operating the CLI | none — operator tooling only |
| `arms/skill-control/candidate.md` | `gpt-5.6-luna`, as Responses `instructions` | it *is* an experimental arm |

`SKILL.md` is not the packaged plugin skill this ADR defers. It is operator
documentation in skill format, safe to write now because it changes nothing
measured. Editing it never invalidates a freeze; editing the other one does.

The model-facing file is the "lean fixed Skill" control named in
`docs/evaluation-plan-v3.md:22`. It is a **control arm, not a treatment**: it
carries only generic repair guidance, so that a T1 gain can be distinguished from
the effect of merely being told to work systematically.

This also bears on the reversal condition above. "Skill-only if the fixed skill
matches the full runtime in held-out tests" cannot be evaluated yet, and not for
the reason previously assumed — `gate-h-heldout-v1` cannot produce a valid
held-out result at all (`research/gate-h-heldout/DEFECT-2026-08-03-unseen-source.md`).
The reversal condition is untestable until `gate-h-heldout-v2` is frozen and run.

