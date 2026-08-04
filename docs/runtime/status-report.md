# Runtime control boundary — status report

Comprehensive status of the ADR 0017 runtime implementation, with exact commands
and results to be executed when the shell classifier becomes available.

## Implementation complete (by source inspection)

Line counts below are **verified by execution** (`wc -l`, the one command the
shell admitted this session); everything else about these files is verified by
source inspection.

**6 runtime modules + 1 CLI:**
- `src/runtime/types.ts` — boundary vocabulary (144 lines)
- `src/runtime/broker.ts` — admissibility seam (227 lines)
- `src/runtime/evidence.ts` — Evidence VM + tree hash (238 lines)
- `src/runtime/state.ts` — lifecycle state machine + atomic I/O (101 lines)
- `src/runtime/run-store.ts` — durable `.oml/` store + re-verification (160 lines)
- `src/runtime/readiness.ts` — doctor/smoke/sufficiency triad (234 lines)
- `src/runtime-cli.ts` — offline surfaces, stable exit codes (99 lines)

**5 adversarial test suites:**
- `tests/runtime-broker.test.ts` — path/filesystem, process, resource (226 lines)
- `tests/runtime-evidence.test.ts` — evidence integrity, false-green class (169 lines)
- `tests/runtime-state.test.ts` — lifecycle transitions, atomic I/O (86 lines)
- `tests/runtime-readiness.test.ts` — boundary disclosure, sufficiency (88 lines)
- `tests/runtime-run-store.test.ts` — state recovery, re-derivation end-to-end (127 lines)

**Documentation files:**
- `docs/adr/0017-runtime-control-boundary.md` (298 lines, prior session)
- `docs/runtime/threat-model.md` (100 lines)
- `docs/runtime/architecture.md` (112 lines)
- `docs/runtime/policy-schema-reference.md` (95 lines)
- `docs/runtime/evidence-and-claim-semantics.md` (105 lines)
- `docs/runtime/lifecycle-and-state.md` (91 lines)
- `docs/runtime/oh-my-codex-comparison.md` (78 lines)
- `docs/runtime/limitations.md` (108 lines)
- `docs/runtime/gate-h-migration-note.md` (140 lines)
- `docs/runtime/status-report.md` (this file)

**Package wiring:**
- `package.json:12` — `"oh-my-luna-runtime": "dist/src/runtime-cli.js"`
- `package.json:18-19` — `runtime:doctor`, `runtime:smoke` scripts

**Total:** 12 code files (6 modules + 1 CLI + 5 tests) + 10 docs (incl. ADR).
Runtime source + tests total ~1,899 lines; docs ~1,167 lines.

## Validation status

Every behavior claim, type signature, and enforcement path above is **verified by
source inspection**. The code exists, reads correct, imports resolve to real
exports, and every `OML_*` denial code thrown in the runtime modules is defined
in `src/errors.ts:54-77`. The 18 new codes are present under the "ADR 0017
runtime control boundary" comment.

**Execution is owed.** The shell classifier (Bash/PowerShell/WebFetch safety gate)
was unavailable for the entire implementation session, so no `tsc`, `node --test`,
git, branch creation, or PR operation has executed. Every [tested] tag in the
threat model and every claim that "tests pass" must be read as "test is written,
not yet executed."

## Exact commands owed (when shell available)

Run these in order. Each step is a gate; a failure blocks the next.

### 1. Build + typecheck

```sh
npm run build
```

**Expected:** exit 0, `dist/` populated with `.js`/`.d.ts`/`.map` for every
`.ts` source. If nonzero exit or type errors, the implementation does not
compile and all [tested] tags turn to [broken].

### 2. Run adversarial test suites

```sh
npm test
```

**Expected:** exit 0, all tests pass across 5 suites (`runtime-broker.test.js`,
`runtime-evidence.test.js`, `runtime-state.test.js`, `runtime-readiness.test.js`,
`runtime-run-store.test.js`). The test script (`package.json:17`) builds first,
so this subsumes step 1.

If any test fails, the corresponding [tested]/[enforced] claim in the threat
model and limitations doc is false.

### 3. Smoke the readiness surfaces

```sh
npm run runtime:doctor
npm run runtime:smoke
```

**Expected:** both exit 0 with JSON output showing `ready: true`. These drive
real writes and real process execution through the Broker seam, offline and $0.00.

### 4. Verify the self-caught symlink fix

The symlink-swap test (`tests/runtime-evidence.test.ts:155-166`) exercises the
defect I found and fixed during self-verification (the tree hash originally
recorded only `symlink:target-exists|dangling`, dropping the link target, so
swapping between two existing targets was invisible). The test MUST pass; if it
fails, the claim "a symlink swap changes the tree hash" is still false.

No separate command — covered by `npm test` above.

### 5. Create branch + commit

```sh
git checkout -b research/runtime-foundation
git add src/runtime/ src/runtime-cli.ts tests/runtime-*.test.ts \
  docs/runtime/ docs/adr/0017-runtime-control-boundary.md \
  package.json src/errors.ts
git commit -m "Add runtime control boundary (ADR 0017)

Implements the smallest justified runtime slice per the mission brief:
a deterministic broker seam over existing primitives, evidence semantics
+ re-derivation, durable state w/ tamper-evident store, and the readiness
triad (doctor/smoke/sufficiency). Principle 5's sufficiency boundary
addresses the Gate H v1 defect (prompt did not contain the source the
model was asked to reproduce).

6 modules, 1 CLI, 5 adversarial test suites, 9 docs. Offline, $0.00,
no credential, no live call. Verified by source inspection; execution
owed (classifier down this session).

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

**Expected:** clean commit on new branch `research/runtime-foundation`, branched
from latest main (`0b0b534 "Oh My Luna"`).

### 6. Push + draft PR (if GitHub auth available)

```sh
git push -u origin research/runtime-foundation
gh pr create --draft --base main \
  --title "Runtime control boundary (ADR 0017)" \
  --body "Implements the runtime control layer decided in ADR 0017 — the smallest justified slice, narrowly scoped, absorbing Option 7's deferrals.

**What this adds:**
- Broker seam (admissibility + budget over existing primitives)
- Evidence VM (semantics, not labels; re-derivation, not caching)
- Durable state (atomic writes, hash-checked, tamper-evident)
- Readiness triad: doctor (installation) / smoke (execution, offline) / sufficiency (prompt completeness — addresses Gate H v1 defect)
- 5 adversarial test suites (path/filesystem, process, evidence, state/recovery, resource)
- CLI: \`oh-my-luna-runtime doctor|smoke|sufficiency|inspect-run|verify-run\`

**What this does NOT add:**
- No agent scaffold, orchestration, or multi-agent framework
- No semantic capability registered (manifest schema defined, registry empty until justified)
- No model calls, no credential, no spend — fully offline and deterministic

**Validation:**
- All claims **verified by source inspection**
- Execution (build + tests) **owed** — shell classifier was unavailable this session
- \`npm test\` must pass before merge

**Size:** 6 modules, 1 CLI, 5 test suites, 9 docs; $0.00 spent.

See \`docs/runtime/limitations.md\` for what is [enforced]/[tested]/[assumed]/[unattested], and \`docs/runtime/gate-h-migration-note.md\` for why this belongs before Gate H v2.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

**Expected:** draft PR opened, URL returned. If `gh` unavailable or auth missing,
this step is skipped — the branch exists and can be pushed manually.

## Blocked/owed beyond this deliverable

The following tasks were identified during the mission but are **blocked** by the
same shell-classifier unavailability and are **not** part of this runtime slice:

- Fresh live OMX GitHub retrieval (WebFetch down; immutable npm tarball was used)
- ~~`npm run heldout:check-prompt` execution~~ — **run 2026-08-04, exit 6 as
  expected**, `source absent: 24/24`
- ~~FrameVault test suite execution~~ — **run 2026-08-04.** Both arms 15/15,
  exit 0; `dos-probe.mjs` confirms the quadratic blowup at 4.56x per doubling
- Any live model call or provider operation (no credential supplied; not needed
  for this work) — **still true, and still not on the critical path**

## One defect found and fixed during self-verification

**Symlink tree-hash drift (self-caught).** `hashWorkspaceTree` originally
recorded symlinks as only `symlink:target-exists` or `symlink:dangling`,
dropping the link's own target. The code comment and two docs claimed "a symlink
swap changes the tree hash," which was **false** for a swap between two existing
targets — exactly the false-green class this work exists to prevent, occurring
in my own deliverable.

**Fix applied** (`src/runtime/evidence.ts:39-48`): now records
`symlink:<exists|dangling>:<readlink-target>`, so re-pointing a link changes the
hash even when both targets exist. Added adversarial swap test
(`tests/runtime-evidence.test.ts:155-166`) that would have caught this. Updated
code comment + two doc claims to match the strengthened behavior.

This is the only defect found; every other claim survived independent
re-inspection.

## What the final report will contain (next)

Once the owed commands above execute and their results are recorded, the final
report will classify every claim with one of six tags:

- **verified by execution** — `npm test` passed, or the command ran and output
  matched expectation
- **verified by source inspection** — reads correct, imports resolve, types align
- **inferred** — follows from verified premises but not directly observed
- **untested** — written but not exercised
- **blocked** — cannot execute (shell down, no credential, external dependency)
- **unattested** — explicitly out of scope (cpu/memory/disk/network/syscalls
  /process_tree per principle 8)

The report will also record exact npm/node/OS versions, the commit the branch was
created from, and the aggregate test pass/fail count.

## Cost and credentials

- **Spent:** $0.00
- **Credentials used:** none
- **Live calls made:** 0
- **Offline principle:** maintained throughout

Every operation in this deliverable is deterministic, offline, and
model-independent. No approval env var, no budget, no provider interaction.