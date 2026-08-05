# Comparison 01 — FrameVault, skill vs no skill

```
status:       output collected, analyzed, probes executed
arms:         Luna-a  stated to have used the Oh-My-Luna skill
              Luna-b  stated not to have
prompt:       Prompt.md — one greenfield spec, both arms
collected:    before 2026-08-03; arrived outside the harness
live calls:   0 by this project
```

## What it varies

A skill, across one model. Both arms received the same greenfield spec; one is
asserted to have had skill text in front of it.

**Which model produced either arm is not recorded anywhere.** Neither is which
skill text was used, the reasoning effort, the timestamp, the token count, or a
transcript. That this is Luna output at all is an owner assertion. This is the
comparison's binding limit and it cannot be repaired after the fact — see
`../README.md` for the `RUN.json` requirement introduced to stop it recurring.

## Results

Executed 2026-08-04. Everything here was previously a code-reading inference.

| | Luna-a (skill) | Luna-b (no skill) |
| --- | --- | --- |
| own test suite | 15/15, exit 0 | 15/15, exit 0 |
| decoder growth, adversarial input | **exponent 1.96, r² 0.997** → quadratic | all samples below the 5 ms floor |
| `npm run typecheck` | misses an injected type error, catches a syntax error | no type-check command |
| unique test coverage | CLI end to end; byte-exact wire vector | truncated-CRC; buffer aliasing |
| tradeoff disclosure | claims the benefit, omits the cost | states what it gave up |

Reproduce:

```sh
cd Luna-a && npm test
cd ../Luna-b && npm test
node --experimental-strip-types ../../scripts/probes/validate-against-sample.mjs
```

## What it shows

Both defects **pass every test their own author wrote.** Under
`evaluator_exit === 0` they are indistinguishable from clean work. That is the
finding, and it is about the measure rather than about either arm.

The quadratic decoder satisfies the spec's anti-allocation requirement exactly —
every declared length in the attack is legal, no single allocation is large. The
requirement as written is met; the requirement as intended is defeated.

Taxonomy drawn from this: `../../research/failure-mode-taxonomy.md`.
Full analysis: `../../research/luna-example-framevault-ab.md`.

## What it does not show

- **Not that the skill caused or prevented anything.** n = 1 per arm, and which
  arm used a skill is an assertion.
- **Not that Luna-a is worse.** It is better on integration coverage — the only
  CLI test and the only byte-exact wire vector — on packaging, and on
  configurability. Both suites have exactly 15 tests, 13 covering the same
  ground, and each arm's 2 unique tests cover something the other misses.
- **Nothing about Opus-5 or Sol.** Neither appears in this comparison.

## Files

- `Prompt.md` — the spec, as delivered
- `Luna-a/`, `Luna-b/` — arm output, unedited
- `dos-probe.mjs` — the original ad-hoc timing series, kept as the historical
  first attempt. It is superseded by `src/probes/growth.ts`, which fits a slope
  instead of reporting per-doubling ratios; on this same data the old probe
  printed a "10.90× per doubling" figure for the **linear** arm, from timings of
  0.6 ms and 6.2 ms, which is JIT warm-up rather than growth.
