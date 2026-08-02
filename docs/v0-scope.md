# V0 scope

## Included

- Node/TypeScript CLI skeleton with one primary entry point;
- JSON schemas and runtime validation for fixtures, traces, evidence, and
  receipts;
- append-only hash-linked trace and content-addressed artifacts;
- baseline runner interface and external command model-adapter boundary;
- deterministic scoring and cost accounting;
- task fixture validation and isolated temporary workspace copy;
- Python and TypeScript task metadata;
- design contracts for Task IR, context capsules, capabilities, and evidence;
- tests on Linux in this research run; cross-platform path behavior represented
  in unit tests where possible.

## Excluded until measured

- generated code instruments in release mode;
- workflow search, RL, and prompt auto-optimization;
- permanent subagents or role selection;
- cloud repository storage;
- hidden Sol routing;
- universal memory, document, research, or creative workflows;
- claims of equivalent isolation across Windows/macOS/Linux;
- performance claims without live paired runs.

## Supported execution claim

The control-plane design targets Windows, macOS, and Linux. The current code has
not been executed on all three. Sandbox-backed execution is unsupported until a
backend is present and attests the required controls.

## User experience

The intended command is:

```text
oh-my-luna run <fixture> --arm native-luna
```

Development commands validate fixtures, inspect traces, and score completed
runs. Users never choose agent roles.

