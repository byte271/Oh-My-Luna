# Changelog

## v0.2.0 — in progress, not released

Premise: **you cannot optimize what you cannot measure.** `evaluator_exit === 0`
scores the measured quadratic denial-of-service and the type-checks-nothing
script as clean work, so no amount of prompt work on those defect classes is
observable. v0.2.0 starts by making them measurable.

### Added — non-functional probes (`src/probes/`)

- `growth.ts` — fits log(time) against log(n) over a doubling series and reports
  the slope with its r². Three corrections over the ad-hoc probe it generalizes:
  a noise floor (the old probe reported "10.90x per doubling" for the *linear*
  arm, from 0.6 ms and 6.2 ms timings — JIT warm-up, not growth); warm-up plus
  repeats with a median; and one fitted slope rather than consecutive ratios.
- `verification-honesty.ts` — mutation testing pointed at the *verifier* instead
  of the tests: inject a defect the command claims to detect, require it to fail.
  The mutation **kind** is load-bearing — a syntax error is caught by anything
  that parses, so failing on broken input is not evidence of type checking.
  Verdicts are per-kind, and a command is credited only for kinds it was probed
  with.

Validated against the one real model output in the repository, with the ground
truth established independently beforehand:

```
Luna-a growth     exponent 1.96, r²=0.997        quadratic_or_worse
Luna-b growth     all samples below floor        indeterminate
Luna-a typecheck  MISSED type_error, caught syntax  partially_verifies
```

All three agree with the prior finding. The Luna-b row is the noise floor
working: the probe declines to report a growth rate it cannot measure rather
than inventing one.

Both probes are **diagnostic**. Neither changes `evaluator_exit === 0`, because
adding an outcome measure is the owner's decision (plan §8) and doing it after
results exist is the same failure as adding an arm after results exist.

### Changed — `Luna-example/` is now a directory of comparisons

It held one A/B at the top level. It now holds one directory per comparison, each
with its own frozen prompt, a `COMPARISON.md` stating what it varies and how it
is scored, and one directory per arm.

```
Luna-example/
  README.md                          index, and the rules for adding one
  01-framevault-skill-ab/            a skill, across one model
    Prompt.md  COMPARISON.md  dos-probe.mjs  Luna-a/  Luna-b/
  02-globmatch-luna-skill-vs-opus5/  substitution test — output collected, scored
    Prompt.md  COMPARISON.md  luna-skill/  opus5-baseline/
```

Arm directory names are unchanged, so the ~40 `Luna-a/src/decoder.ts:NNN`
citations across `research/` remain valid; only the `Luna-example/` prefix moved.

### Added — comparison 02, GlobMatch: Luna vs Opus-5

Design; output arrived later and is scored in the section above.

The task is a glob matcher with no regular expressions permitted — that
constraint is load-bearing, because "translate the glob to a `RegExp`" delegates
the whole algorithmic decision to V8 and both arms would produce near-identical
wrappers. Forbidding it forces the matching algorithm to be written, which is the
thing being compared.

The prompt states the cost requirement at the **purpose** level ("a caller must
not be able to choose inputs that make matching take unreasonably long"), the
same shape as FrameVault's anti-allocation clause — deliberately *not* "avoid
exponential backtracking". Naming the trap would test instruction-following; the
question is whether it is recognized unprompted.

Scoring is pre-registered before any output exists, including the exact
adversarial workload (`a*a*a*a*a*a*b` against `"a".repeat(n)`, n ∈ 16…256).

It also fixes comparison 01's binding weakness: each arm must carry a `RUN.json`
recording model identifier, reasoning effort, harness, **tools available**, and
timestamps. If one arm could run its own tests and the other could not, the
comparison is between harnesses rather than models.

Standing limit, stated in the file itself: n = 1 per arm cannot establish that
either model is better, and nothing produced there may be quoted as parity or
superiority.

### Added — research

- `research/failure-mode-taxonomy.md`. Three measured defect modes, and the
  pattern they share with four failures in this repository's own harness: **a
  check that is true about the letter offered as evidence about the purpose.**
  Three of those four are harness code; the fourth was produced by a model, in a
  different language, unprompted.

### Added — `arms/oh-my-luna-skill/`, the skill proper

Model-facing. Three obligations, and the design rule is that **each traces to a
defect measured in real generated code** — nothing from prompt-engineering
folklore, nothing included because it sounded rigorous. There are three because
three modes were measured; a fourth would need a fourth measurement.

Each is **executed, not considered**:

| Obligation | Targets | Why executed |
| --- | --- | --- |
| time it at n and 2n | decoder at exponent 1.96 | the author's reasoning was *correct* — it genuinely never preallocates. Only two timings catch it |
| break the check, confirm it fails | `typecheck` missed a type error | the printed claim was literally true; only attempted falsification separates a checker from a parser |
| report only what you ran | README claimed benefit, omitted cost | disclosure is checkable against behaviour; "be honest" is not |

"Be careful" was rejected as a design and the reason is recorded: the arm that
shipped the quadratic DoS also shipped 15 passing tests, the only CLI integration
test, the only byte-exact wire vector, and an accurate README. **The output
already looks careful.**

`DESIGN.md` records what each choice costs, including that the "where not to
spend effort" section is a real bet that could backfire — comparison 01's skill
arm was *better* on breadth, and suppressing that may cost more than the
obligations gain. If the skill reduces functional success, that section is named
as the first suspect.

**It requires a shell.** Under `tools: []` the model can only *claim* to have
timed a workload or broken a check — the exact defect it targets, one level up.
So it must not be used in Gate H Stage A; `purpose-check/` is the repair-task
variant that assumes no shell. `arms/README.md` now states the control/treatment
distinction and the shell requirement.

### Added — comparison 02 output, scored against its pre-registration

Both arms arrived and were scored with the criteria fixed beforehand.
`RESULTS.md`.

**The scoring does not separate them.** Both passed the growth probe with every
sample below the noise floor, and an exploratory extension to n=16,000 with
20-star and globstar-heavy patterns found nothing above 10 ms in either. The trap
that caught the FrameVault sample caught neither arm here.

Verification honesty split by environment. With `tsc` on PATH both `verify`. With
`tsc` absent — which is what the prompt's no-dependencies constraint implies —
`luna-skill` is `partially_verifies` and `opus5-baseline` is `inconclusive`: a
false green that announces itself in its own output, versus a command that cannot
run at all. Both are defensible answers to "the constraint forbids the tool I
need", and the probe verdicts alone do not capture the difference.

Differential testing over 20,000 random pairs found every disagreement traced to
one cause: **an ambiguity in the prompt I wrote**, about whether `**` inside a
segment is a star run or two literal characters. Both arms resolved it
consistently and documented their reading. That dimension is unscoreable and
neither arm is marked down for it.

One unambiguous defect, found by the differential pass: `opus5-baseline`
contradicts its own README on an all-stars segment — `match("***", "a/b")` is
true where its documented rule requires false. Narrow, and recorded because the
taxonomy names that class.

Neither arm shipped a `RUN.json` despite the requirement predating the output, and
the `luna-skill` upload's `.git` had zero commits. Stubs are committed with every
unknown `null` and `provenance_recorded: false`. **No claim about either model is
supportable from this**, which is what COMPARISON.md said before the output
existed and remains true after.

### Changed — comparison 02 is asymmetric, and named for it

Renamed `02-globmatch-luna-vs-opus5` → `02-globmatch-luna-skill-vs-opus5`, arms
`luna`/`opus5` → `luna-skill`/`opus5-baseline`. **Luna receives the skill;
Opus-5 receives nothing but the prompt.**

This makes it a **substitution test**, not a model comparison: can the cheap
model plus scaffolding take the expensive model's place? That is the question
this project actually cares about, and it is how each would really be deployed.

What it therefore cannot do, recorded in the file so it travels with any result:
the arms differ in two variables at once, so **nothing can be attributed to
either**. A `luna-skill` win is not "Luna matches Opus-5" — it is "Luna with this
skill produced output comparable to bare Opus-5 on one task." Adding a
`luna-baseline` third arm decomposes it and costs one run; recorded as the
obvious next step.

`RUN.json` now also requires the attached skill's payload hash. An arm that does
not record which skill text it received repeats comparison 01's binding weakness.

### Added — a treatment arm (`arms/purpose-check/`)

A model-facing candidate testing one hypothesis: that a few *checkable
disclosures* reach the letter-satisfied/purpose-defeated class where generic
"work carefully" guidance cannot, because the output already looks careful.
Kept strictly separate from `arms/skill-control/`, which is a control and whose
blandness is a design constraint.

Untested — no model has been run against it. Carries its own falsification
conditions, including that a drop in functional success would count against it.
Its unresolved output-contract tension is recorded, not settled.

### Fixed

- `Dirent.parentPath` is Node 20.12+ while `engines` declares `>=20`. Two sites
  fell back to `?? root`, which silently collapses every nested entry to
  `root/<basename>` on 20.0–20.11. In `hashWorkspaceTree` that means wrong tree
  hashes or ENOENT; in the canary scanner, detection survives but the reported
  path does not. Both now go through `src/dirent.ts`.
- `redactSecrets` anchored on `\b`, which does not match between two word
  characters, so a key concatenated to a preceding token survived the pattern
  backstop; and it covered only `sk-`/`rk-`, leaving session tokens untouched.
  `org-` is deliberately still preserved — not a credential.

### Not done, and why

- **Wiring the growth probe into the held-out corpus.** It needs a per-task
  adversarial workload, which the corpus does not define and which would have to
  be authored — reintroducing author discretion exactly where the mechanical
  selection rule was designed to remove it. Documented rather than half-built.
- **A detector for undisclosed tradeoffs** (mode 3 of the taxonomy). It would
  require a model judging prose, which is author-produced un-blinded scoring —
  the weakness `research/gate-m-verdict.md` already records. Left as a marked gap.
- **Any comparison to Opus-5 or Sol.** No output from either exists in this
  repository. The comparison has no data on either side.

240 tests pass.

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
