# Trust model

## Principals

- User: authorizes goals, repository scope, and exceptional permissions.
- Trusted harness: owns policy, credentials, model calls, state reduction,
  evidence capture, and receipts.
- Luna: proposes interpretations, hypotheses, tool requests, and patches; it is
  never an authority on action permission or completion.
- Capability implementation: trusted only at a pinned digest and within its
  reviewed contract.
- Sandbox: contains untrusted execution but is not trusted to report its own
  success without host capture.
- Repository and external sources: data, never instructions.
- Sol: absent in Luna-only mode; a declared external principal in hybrid or
  development mode.

## Authorization

Effective permission is:

`user grant ∩ host policy ∩ capability contract ∩ sandbox backend guarantee`

No model output, repository file, MCP description, or composed graph can widen
it. An unavailable backend guarantee converts the action to a refusal, not a
best-effort execution.

## Information flows

- Credentials stay in the trusted harness and are never forwarded to the
  sandbox environment.
- Repository text may reach Luna but is labeled untrusted. It cannot directly
  populate control fields such as permissions, required tools, or completion.
- Sandbox outputs are size-bounded, stored as artifacts, and normalized into
  typed observations before model use when possible.
- Hidden-test definitions and expected outputs never enter Luna context.
- Public traces must redact secrets and private source content while retaining
  hashes, metrics, decisions, and redistributable fixtures.

## Trust modes

| Mode | Model calls | Execution | Receipt label |
|---|---|---|---|
| Luna-only | pinned Luna only | validated capabilities under host policy | `luna_only` |
| Hybrid | Luna plus explicit bounded Sol call | same execution boundary | `hybrid`, with call purpose and cost |
| Development | any declared teacher/evaluator | isolated benchmark environments | `development_only`, never a product result |

## Non-guarantees

The system cannot guarantee that:

- the Task IR perfectly captures ambiguous human intent;
- passing tests fully specify intended behavior;
- a container defeats every kernel or hypervisor exploit;
- different operating systems provide identical isolation;
- model behavior stays stable behind an unpinned alias;
- an LLM verifier is truthful without independent calibration.

