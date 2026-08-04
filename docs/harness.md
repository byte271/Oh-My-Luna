# Evaluation harness

Status: implemented evaluation kernel; **not a Luna benchmark result**. Pricing
evidence retrieval: 2026-08-02T00:49:04-04:00.

## Purpose

The harness makes native Luna, a fixed Skill, an Oh-My-Luna treatment, and Sol comparable through one adapter boundary. A model adapter is an external executable that accepts one JSON request on standard input and emits one schema-valid JSON response on standard output. Oh-My-Luna does not include a fake OpenAI adapter or silently substitute a test double.

## Reproducible commands

```sh
npm ci
npm run typecheck
npm test
npm run smoke
```

The smoke fixture is explicitly a deterministic interface test, not a model evaluation. Its zero token usage and zero price are test data.

## Fixture contract

`schemas/task-fixture.schema.json` fixes the issue, repository identity, adapter command, model name, reasoning effort, prices, verifier, timeouts, output limit, and whether a true security sandbox is required. `{fixture_dir}` and `{workspace}` tokens in command arguments are expanded without a shell.

Adapter credentials are not inherited by default. A trusted fixture may name individual environment variables in `adapter.environment_allowlist`. That is an explicit credential boundary and must never be controlled by repository content.

## Isolation and trust

The included provider copies a repository into a new run directory and rejects path and symlink escapes when applying proposed files. It sanitizes subprocess environments, uses argument arrays rather than a shell, bounds time and output, records content-addressed artifacts, and writes a hash-linked JSONL trace.

This is filesystem copy isolation, not a security sandbox. The runner refuses fixtures with `requires_security_sandbox: true`. Verifiers and adapters are trusted harness code. Running malicious repository tests safely still requires an attested backend described in ADR 0005.

## Result semantics

Receipt schema 0.3 separates five facts:

- `run_status`: whether orchestration completed, errored, or was cancelled;
- `adapter_status`: whether the adapter process completed successfully;
- `configured_verifier.status`: whether the fixture's named verifier returned an accepted exit code;
- `claim_evaluation.status`: whether individual model or user claims were evaluated;
- `terminal_evidence_status`: whether the stronger task evidence policy is satisfied.

Gate C implements only the first two. Claim evaluation and terminal evidence are explicitly `not_evaluated`. The CLI exits successfully only when the run completed and the configured verifier passed, but that exit code is not a general correctness claim.

Receipts also include frozen task/intervention hashes, prompt and Skill hashes,
exact snapshot and environment identity, per-request billing records, cost
accuracy and omissions, artifacts, raw model claims, errors, and the final
trace hash.

## Adding a real adapter

A real adapter should live outside the core harness and:

1. consume the request schema;
2. pin an exact model snapshot and reasoning effort;
3. capture the complete provider response/tool trace with secrets removed;
4. return actual token usage;
5. make retries explicit;
6. emit only a schema-valid response;
7. be invoked with the same permissions and budgets for each treatment.

Provider SDK integration is intentionally deferred until credentials and a stable, documented endpoint are available. This prevents an untested integration from being reported as working.
