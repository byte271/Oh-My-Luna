# Oh-My-Luna

Oh-My-Luna is an experimental, model-specific capability runtime for turning
well-scoped repository defects into evidence-backed patches with GPT-5.6 Luna.

The project is currently research-first. It does **not** claim to make Luna
equivalent to GPT-5.6 Sol. The surviving V0 thesis is narrower: compile a task
into small decision capsules, expose a few verified high-level capabilities,
and prevent unsupported completion claims.

Current status:

- Gate A research and falsification: complete in the repository.
- Gate B architecture decisions: complete in the repository.
- Gate C evaluation skeleton: implemented.
- Gate D/E live Luna experiments: not run; this environment has neither an
  OpenAI API credential nor a Codex executable.

See `docs/product-thesis.md`, `docs/architecture.md`, and
`docs/evaluation-plan.md` before treating any component as core.

## Gate C quick start

```sh
npm ci
npm run typecheck
npm test
npm run smoke
```

The included smoke adapter is a deterministic test double. It proves the
harness contract and failure gates, not Luna quality. See `docs/harness.md`.
