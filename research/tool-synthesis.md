# Tool synthesis: falsification and boundary

## Decision

**Architecture decision:** Tool Foundry is not a source-code generator. It is a
capability resolver and instrument compiler. Resolution order is fixed:

1. use a deterministic built-in primitive;
2. use a validated high-level capability;
3. compose a per-task declarative instrument from 1 and 2;
4. only if the required observation is inexpressible, generate temporary code
   under a stricter policy.

Tier 3 generated code is disabled in V0 release mode. It may be enabled only in
an experimental evaluation arm.

## Alternative scoring

Scores are 1 (poor) to 5 (strong). “Quality” is expected target-task gain, not
general intelligence. Scores are **design estimates** informed by the research,
not measurements.

| Alternative | Quality | Feasibility | Security | Reliability | Latency | Cost | Maintenance | Cross-platform | Eval clarity | Uniqueness | Durability | Total / 55 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| A. Curated permanent macro tools | 4 | 5 | 4 | 5 | 4 | 5 | 4 | 4 | 5 | 2 | 4 | 46 |
| B. JIT source tool generation | 3 | 2 | 1 | 2 | 1 | 2 | 1 | 2 | 2 | 4 | 2 | 22 |
| C. Retrieval + composition | 5 | 4 | 4 | 4 | 4 | 5 | 4 | 4 | 5 | 4 | 4 | 47 |
| D. Generated executable workflows, fixed tools | 4 | 3 | 3 | 3 | 3 | 3 | 2 | 3 | 3 | 4 | 3 | 34 |
| E. Context compilation + fixed evidence flow | 4 | 5 | 5 | 5 | 5 | 5 | 4 | 5 | 5 | 2 | 4 | 49 |
| F. Multi-agent/test-time scaling | 4 | 4 | 3 | 3 | 1 | 1 | 3 | 4 | 3 | 2 | 3 | 31 |
| G. Offline Sol trajectory distillation | 4 | 2 | 4 | 3 | 5 | 4 | 2 | 4 | 2 | 3 | 2 | 35 |
| H. Layered E + C, selective F/G | 5 | 4 | 4 | 4 | 4 | 5 | 3 | 4 | 4 | 4 | 4 | 45 |

The score winner, E, is intentionally simpler than the candidate thesis. The
recommended V0 is E plus a narrow part of C. H is the roadmap, not the minimum
experiment.

## What an instrument may be

| Form | V0 policy | Example |
|---|---|---|
| Query plan | allowed | search symbol, callers, tests, and last modifying commits |
| Declarative workflow | allowed | reproduce -> capture trace -> compare invariant |
| Typed adapter | allowed after review | normalize pytest and vitest failures into one schema |
| Temporary test harness | allowed if composed from file-write and process primitives in isolated worktree | assert a reported race under repeated seed/control |
| Runtime probe | allowed through reviewed debugger/trace capability | capture values at a breakpoint without exposing debugger protocol |
| Repository-specific analyzer | composition first; generated code experimental | detect inconsistent platform allowlists |
| Verifier | allowed only with an independently stated oracle and negative controls | verify no completed side effect repeats after resume |
| Arbitrary source program | disabled by default | any generated Python/JS not representable by the graph |

## Instrument lifecycle

1. **Need detection** emits an observation question, why existing evidence is
   insufficient, expected discriminating result, and cost ceiling.
2. **Capability specification** declares typed inputs/outputs, effects,
   permissions, determinism, timeout, and failure codes.
3. **Resolve** searches exact capability contracts before semantic descriptions.
4. **Compose** creates an acyclic declarative graph with bounded fan-out and no
   implicit shell interpolation.
5. **Static validation** checks schema, path scope, executable allowlist,
   permission monotonicity, cycles, and resource budgets.
6. **Sandbox execution** occurs in a disposable worktree with network disabled
   and no secrets.
7. **Test generation** supplies positive, negative, malformed-input, timeout,
   and adversarial repository fixtures.
8. **Schema verification** rejects missing, extra, or untyped output fields.
9. **Permission assignment** is the intersection of capability declarations,
   task authorization, and host policy; composition cannot widen permissions.
10. **Provenance recording** hashes graph, inputs, tool versions, environment,
    output, and logs.
11. **Runtime use** returns a bounded typed observation, never an unfiltered log
    by default.
12. **Audit logging** appends a hash-linked event outside sandbox control.
13. **Invalidation** fires on relevant input, tool, environment, or code hash
    change.
14. **Cleanup or promotion** deletes ephemeral state; promotion requires review,
    repeated held-out utility, a stable contract, and security tests.

## Why generated source is a last resort

LATM's most attractive cost result used a stronger model as tool maker.
SkillsBench found no average benefit from self-generated skills. ToolMaker's
objective tests are encouraging but still show failures and require dependency
installation. ADAS warns about destructive generated code. CodeAct establishes
that executable actions can improve performance, but only with a separate code
execution boundary.

**Inference:** generated code may be valuable when the task needs a genuinely
new observation mechanism. It is not justified for routine repository search,
test selection, AST queries, failure normalization, hashing, or verification.

## Tier definitions

- **Tier 0 deterministic primitive:** reviewed implementation; no model call;
  exact effects and typed result.
- **Tier 1 macro capability:** reviewed composition or implementation with
  domain fixtures and a stable high-level observation contract.
- **Tier 2 task instrument:** per-run declarative composition; validated before
  execution; expires with the run.
- **Tier 3 generated code:** model-produced source; isolated, untrusted,
  exhaustively logged, time-limited, and never promoted automatically.

The first prototype should include only Tier 0 and one Tier 1 capability. Tier
2 is represented by the task-specific graph. Tier 3 appears only in an ablation.

