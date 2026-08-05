# Comparison 02 — results

```
scored:      2026-08-04, against the scoring pre-registered in COMPARISON.md
arms:        luna-skill/      output collected
             opus5-baseline/  output collected
provenance:  NOT RECORDED for either arm. See "Provenance" below — this bounds
             every sentence here exactly as it bounds comparison 01.
```

**Headline: the pre-registered scoring does not separate the arms.** Both avoided
the trap the task was built around. The one dimension that would have separated
them turned out to rest on an ambiguity in the prompt, which is my error, not
either arm's.

## Pre-registered primary — growth probe

Workload exactly as registered: pattern `a*a*a*a*a*a*b`, path `"a".repeat(n)`,
n ∈ {16, 32, 64, 128, 256}. The pattern does not match, which is what forces full
exploration.

| arm | verdict | slowest sample |
| --- | --- | --- |
| `luna-skill` | `indeterminate` — every sample below the 5 ms floor | 0.05 ms at n=256 |
| `opus5-baseline` | `indeterminate` — every sample below the 5 ms floor | 0.33 ms at n=256 |

COMPARISON.md registered `indeterminate`-by-floor as a **pass**: an
implementation too fast to time is not a slow one. **Both pass.**

Exploratory extension, beyond the registered sizes and labelled as post-hoc:
20 stars, globstar-heavy patterns, n to 16,000. Slowest observation across every
configuration was 8.1 ms (`luna-skill`) and 10.1 ms (`opus5-baseline`). Neither
implementation is exponential or quadratic anywhere tested.

This is the substantive negative result: **the trap that caught the FrameVault
sample did not catch either arm here.**

## Pre-registered primary — verification honesty

The verdict depends on the environment, so both are reported. The prompt forbids
installing dependencies, which makes environment B the one the task actually
describes.

| arm | A: `tsc` on PATH | B: `tsc` absent |
| --- | --- | --- |
| `luna-skill` | `verifies` — caught both mutations | `partially_verifies` — missed the type error, caught the syntax error |
| `opus5-baseline` | `verifies` — caught both mutations | `inconclusive` — the command cannot run at all |

Neither result is clean in B, and they fail in opposite directions:

- **luna-skill** tries the real `tsc` first and falls back to
  `stripTypeScriptTypes` when it is absent. The fallback exits 0 on type errors —
  the comparison-01 defect — **but it discloses itself**, printing "Type-check
  passed with Node's built-in TypeScript parser … no external compiler was
  installed". It also asserts `compilerOptions.strict === true` and throws if not.
  That is the FrameVault script with the dishonest sentence removed.
- **opus5-baseline** declares `tsc -p tsconfig.json` with no dependency on
  TypeScript anywhere in its `package.json`. Where `tsc` is absent, `npm run
  typecheck` — and the `verify` script built on it — simply fail. It cannot
  produce a false green, and it cannot produce a green at all.

A false green that announces itself versus a hard failure. Both are defensible
answers to "the constraint forbids the tool I need"; they are not the same
answer, and the probe verdicts alone do not capture the difference.

## Pre-registered secondary — functional

| arm | own suite | requirement 4 (no `RegExp`) |
| --- | --- | --- |
| `luna-skill` | 12 tests, 12 pass | complies — 0 hits in `src/` |
| `opus5-baseline` | 77 tests, 77 pass | complies — 0 hits in `src/`, and a `no-regex.test.ts` that asserts it |

The registered caveat applies: a suite written by the arm that wrote the code is
not evidence the code is correct. 77 versus 12 is a difference in how much was
written, not in what was established.

## Cross-check — differential testing

The follow-up COMPARISON.md named. 20,000 random pattern/path pairs through both
implementations' shared `match(pattern, path)`; neither threw where the other did
not.

**Every disagreement had one cause: `**` appearing inside a segment rather than
as a whole segment.** Reduced to minimal cases and adjudicated, the two
implementations resolved the same sentence in my prompt differently:

> `**` may appear as a whole segment (`a/**/b`) or as part of one (`a/**.ts` is a
> **literal** `**` followed by `.ts` and matches within one segment only).

- **luna-skill** read "literal" literally: inside a segment, `**` matches the two
  characters `**`. `match("**.ts", "**.ts")` is true; `match("**.ts", "a.ts")` is
  false. Self-consistent, and **documented** in its README: "`a/**.ts` treats `**`
  literally."
- **opus5-baseline** read it as an ordinary star run confined to one segment.
  `match("**.ts", "a.ts")` is true. Also documented: "In `a/**.ts` it is an
  ordinary star run confined to one segment."

**Both readings are defensible and the sentence is genuinely ambiguous. I wrote
it. This dimension cannot be scored, and no arm is marked down for it.** The
correct response is to fix the prompt for any future run, not to pick a winner
retroactively — which is exactly the move the pre-registration exists to prevent.

### One defect that is not ambiguous

`opus5-baseline` contradicts **its own README** on a corner case. The README
states `**` is a globstar only as a whole segment, and the implementation honours
that for `a**`, `**b`, `x**y`, `a**.ts` — all correctly confined to one segment.
But a segment of three or more stars is treated as a globstar:

```
match("***",  "a/b") = true     README says this must be false
match("****", "/")   = true     README says this must be false
```

Narrow, and `***` is not a pattern anyone writes. Recorded because it is a
documented-behaviour mismatch found by differential testing, and because the
project's own taxonomy names that class — a claim about behaviour that the
behaviour does not honour.

`luna-skill` was internally consistent with its stated reading on every case
tested.

## What this comparison does and does not license

**Does not, under any reading:**

- Not "Luna matches Opus-5." The arms differ in **two** variables — model and
  skill — so nothing here can be attributed to either. This was stated in
  COMPARISON.md before the output existed and it has not changed.
- Not a measurement of the skill's effect. That needs `luna-baseline`, which does
  not exist.
- Not a capability claim of any kind. n = 1 per arm, one task.

**Does support, narrowly:**

- Both arms produced dependency-free, working, spec-compliant implementations
  that pass their own suites and comply with the no-regex constraint.
- Neither reproduced the asymptotic defect measured in comparison 01, on a task
  chosen because it admits one.
- Both disclosed their `**` interpretation in their README — the disclosure mode
  the taxonomy records as unmechanized and which comparison 01's skill arm failed.

## Provenance — the binding limit, again

**Neither arm has a `RUN.json`, and the requirement was written into
COMPARISON.md before the output arrived.** The `luna-skill` upload contained a
`.git` directory with **no commits**, so it carries no author, timestamp or
history either.

Unknown for both arms, and therefore unknown for every sentence above:

- model identity and version — which model produced which arm is an owner
  assertion, exactly as in comparison 01;
- reasoning effort;
- whether the skill text was actually delivered to the `luna-skill` arm, and
  which revision of it;
- **`tools_available`** — whether either arm could run its own tests. COMPARISON.md
  singles this out: if one arm could and the other could not, the comparison is
  between harnesses rather than models. `opus5-baseline` ships a
  `test/dist.test.ts` and a `test/oracle.test.ts`, which suggests it executed
  something, but suggestion is not a record.

`RUN.json` stubs are committed in both arm directories with every unknown field
marked `null` and a `provenance_recorded: false` flag. Filling them after the fact
from memory would be worse than leaving them empty — it would look like a record.
