# Changelog

## v0.1.0 — 2026-08-04

First tagged version. **This is an evaluation kernel, not a capability result.**

Read this first, because the version number is the only thing here that could be
mistaken for a claim:

- **No model has ever been called.** `live_calls_made: 0`, `$0.00` spent.
- There is **no demonstrated intelligence amplifier**, no trained specialist, no
  live provider result, and no attested sandbox.
- Protocol `gate-h-heldout-v2` is implemented and passes its gates but is
  **not frozen**, and its runner refuses live execution.
- `0.1.0`, not `1.0.0`, on purpose. The frozen `forbidden_claims` list includes
  *product readiness*, and a `1.0.0` would assert exactly that.

What the repository does contain: controlled execution, scoring, tracing,
negative safety checks, and — as of this version — an instrument that poses an
answerable question.

### Measured, having previously been reasoned only

The prior session had no shell and labelled every finding as inference. Those
were executed:

| Claim | Result |
| --- | --- |
| Source absent from every Stage A prompt | confirmed — 24/24 combinations, exit 6 |
| Two files exceed the output cap | confirmed — `tomlkit/container.py` ~12,136 tok, `boltons/iterutils.py` ~15,262 tok vs a cap of 8,192 |
| SIGKILL yields evaluator exit 17 | confirmed — a killed child reports `code: null`, so the `code === -1` guard cannot fire |
| `URL.pathname` breaks path resolution | confirmed, and wider than recorded: percent-encoding breaks Linux checkouts containing a space, not just Windows |
| Both FrameVault suites pass | confirmed — 15/15 each |
| The sample's quadratic blowup | confirmed — 4.56x per doubling at the largest point measured, against a flat control |

### Fixed — defects that were recorded nowhere

- **The freeze verifier reported success over fields it never hashed.**
  `aggregate_sha256` covers 6 of 22 top-level fields and `identity.json` is
  excluded from the artifact list, so `analysis_plan` — which holds the
  registered continuation rule — plus `forbidden_claims` and `live_calls_made`
  were unprotected. Demonstrated by lowering the rule, deleting a forbidden
  claim and setting `live_calls_made: 999`, after which `--verify` still printed
  `mismatched=0 aggregate=match` and exited 0. Now sealed document-wide, with
  coverage printed on every run. ADR 0018.
- **`evaluate.mjs` leaked a workspace copy per evaluation** — cleanup sat in a
  `finally` while every terminal path called `process.exit()`, which does not
  unwind. Twenty abandoned repository copies per Stage A.
- **`provision.mjs`'s documented exit codes 3/4/5 were unreachable** —
  `ProvisionError` was never caught, so every failure exited 1, including the
  corpus-divergence case operators are told to treat specially.

### Fixed — latent defects that the planned v2 change would have activated

- **Prompt corruption.** Assembly used `String.replace` with a string
  replacement, which expands `$&`, `` $` ``, `$'` and `$1`–`$99`. No corpus issue
  file contains a `$`; source code does routinely, and v2 puts source in the
  prompt. The corrupted prompt would have been hashed into `prompt_sha256` as
  though intended.
- **Second-pass injection.** Sequential replaces rescan substituted text, so
  source containing a literal placeholder would receive assistance metadata.

### Added — protocol v2 (candidate, not frozen)

Plan steps 1–6, offline and at $0.00:

- Complete source in every arm including T0; the false repository-root claim
  deleted.
- Four blocking sufficiency gates — `prompt_completeness`,
  `output_cap_headroom`, `template_claim_audit`, `stub_realism`. v1 fails three;
  v2 passes four.
- Output cap set from measurement: 24,576 = 16,384 answer + 8,192 reasoning.
  Shrinking the corpus was considered and rejected, with the rule recorded.
- Base-vs-returned diff metadata per attempt — **diagnostic only.** Success
  remains exactly `evaluator_exit === 0`; a diff never creates a pass.
- Timeout (18) and foreign signal (19) distinguished from test failure (17),
  each carrying `attributable_to_model`.
- Hardened change-set validation: fail-closed on an empty permitted set,
  duplicate paths rejected, foreign-platform absolutes rejected, and writes
  refused when they escape through the shared `node_modules` symlink.
- Unprivileged stubs receive the prompt and nothing else, so *a stub must not be
  better informed than the model it stands in for* is enforced by a type rather
  than a convention. `noop` reconstructs the base file from the prompt and must
  produce zero diff hunks; a fifth stub, `unseen`, is the regression test for the
  original defect.

### Known limits

- Five tasks is exploratory. No capability claim is possible at this size, and
  `docs/kill-criteria-v3.md` already forbids one.
- No independent semantic reviewer has participated at any point; every packet
  remains `author_reviewed_semantic_separation_unverified`.
- Filesystem copying is not containment. A verifier can execute hostile
  repository code with the host user's authority.
- Leakage checks are heuristics. A clean report means no implemented heuristic
  fired.
- `gpt-5.6-luna` is a mutable alias with no dated snapshot; drift is detectable
  after the fact, never prevented.
- Sufficiency is not validity. The gates show the prompt is adequate to the task
  posed, not that the study measures what it intends.

### Open — owner decisions, blocking a v2 freeze

1. **§5** whether to include the skill-control arm. Without it a T1 gain is
   ambiguous between "the specific context helped" and "being told to work
   systematically helped."
2. **§8** whether `evaluator_exit === 0` is an adequate outcome measure. It
   cannot express asymptotic cost, adversarial input handling, or whether a
   self-reported verification step verified anything — and as of this version
   that limit is measured rather than hypothetical.

Both become author discretion the moment results exist, which is why the v2
runner refuses to spend money before they are settled.

---

Prior history: two lineages with no common ancestor were merged at this version
(`6020aca`/`93837e1`, Aug 1; `0b0b534`…`f87962b`, Aug 3). Both remain reachable.
