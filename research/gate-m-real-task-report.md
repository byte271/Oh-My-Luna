# Gate M real-task method-validation report

Status: mechanically ready for external review; no Luna capability result  
Date: 2026-08-02

## Result

Four historical TypeScript defects from three repositories pass the required
base-fail/corrected-pass check at exact commits. Twenty cumulative L1-L5 drafts
and twenty blinded review bundles were produced. Every draft is explicitly
`model_authored_unreviewed`; none is an approved treatment packet. There were no
independent reviewers in this session, so reviewer agreement and the L3/L4
collapse decision are pending.

Gate M therefore does not pass. The accurate state is: mechanically ready for
external semantic review, with treatment execution blocked.

## Real tasks

| Task | Defect | Base evidence | Corrected evidence | Evaluator |
|---|---|---|---|---|
| `zod-tuple-default` | omitted trailing default | exit 17, `["present"]` | exit 0, `["present","fallback"]` | source-run under tsx |
| `zod-absent-catch` | absent property rejects catch fallback | exit 17, `invalid_type/nonoptional` | exit 0, `{"area":[]}` | source-run under tsx |
| `date-fns-zh-month` | zh-CN October invalid and 11/12 become January | exit 17, `["Invalid","Invalid",1,1]` | exit 0, `[10,10,11,12]` | Node TypeScript stripping |
| `type-fest-conditional-keys` | optional key lost under TS 5.4 | exit 2, TS2344 | exit 0 | TypeScript 5.4.2 compile assertion |

The exact commands, archive hashes, output hashes, exit codes, and measured
durations are in each `control/task-validation.json`. Fresh base archives were
recreated from `git archive`; their hashes matched the manifests, they reproduced
the failures, and scans found no corrected commit identity or `.git` directory.

## Candidate exclusions

Ten candidates were recorded; four were included and six excluded, a 60%
rejection rate. follow-redirects, minimist, JSON5, cookie, and node-ip were
outside the selected TypeScript/Python scope or lacked a trustworthy corrected
state. path-to-regexp was rejected because a timing-sensitive ReDoS evaluator
would undermine the deterministic method gate. The complete reasons remain in
`tasks/gate-m/candidate-pool.json`; failed candidates were not silently replaced.

## Intervention authoring

The primary design remains cumulative L1 through L5. L1 contains only paths and
ranges; L2 adds base-state symbols and a structural boundary; L3 adds observed
execution facts; L4 adds causal diagnosis; L5 adds behavioral objectives,
constraints, and non-goals. Generated reviewer payloads contain neither a target
level nor a prior decision.

Automated checks found two real authoring problems before freeze:

1. Evidence references initially named the control validation path. They were
   replaced by opaque evidence IDs before any review export.
2. The Zod catch L5 objective used `caught`, an identifier introduced only by
   the corrected patch. It was rewritten to “fallback substitution.”

Those corrections changed 13 generated draft files before freeze. They are
authoring corrections, not independent review. Automated checks remain
heuristics and cannot establish semantic purity.

## Reviewer state

- actual independent reviewers: 0;
- actual reviewer classes: none;
- exact classification agreement: unavailable;
- neighboring-level agreement: unavailable;
- disclosure agreement: unavailable;
- L3/L4 collapse decision: pending.

The frozen policy requires two distinct reviewers, excludes the author, hides
target labels and prior decisions, and preregisters an 80% exact-agreement
threshold plus qualitative collapse triggers. The current Sol author is not
counted as a reviewer.

## Evaluator boundary

The evaluator is invoked shell-free with filtered environment, bounded output,
and timeout from a detached copy of the final workspace. Canary tests reject
treatment data in declared argv, environment, stdin, filenames, or output, and
an adjacent orchestrator trace is not present at the detached interface.

Classification: **interface separation validated; operating-system
confidentiality not enforced**. The child process can still traverse the wider
host filesystem. Evaluators and repository source remain trusted, and copy
isolation is not containment.

## Practicality

Measured machine work after dependencies were available:

- exact four-task base/fixed validation: 4.1 seconds wall time;
- sum of eight evaluator child durations: 3.162 seconds;
- Zod dependency setup: four parallel installs, 124-128 seconds each, about
  129 seconds wall time, 1,060-1,062 packages per worktree;
- review-bundle generation: under one second;
- committed Gate M corpus before freeze: 290,167 logical bytes, 130 files.

Candidate-identification, semantic-authoring, evaluator-construction, and
source-review time were not instrumented separately. The 19-minute interval
between the recorded exact validation and the first complete bundle set also
included implementation and debugging, so it is not a clean authoring-time
measurement. Human review time is zero because no review occurred. These
missing measurements are a method defect to correct before scaling.

Manual or trust-dependent steps remain: repository/issue selection, license
inspection, source checkout, Zod dependency setup, compiler acquisition,
semantic packet wording, external review, and sandbox trust assessment.

A planning estimate—not a measured result—is 60-120 person-hours for a
20-task pilot once two reviews of 100 packets are included, and 300-600 hours
for a 100-task release-quality corpus. The current five-packet ladder may be too
expensive; external disagreement may justify a shorter protocol.

## Scientific conclusion

The four defects are sufficient to test the mechanics on real source. They do
not establish that the information levels are semantically separable, that Luna
benefits, or that any assistance category is practically approximable. No live
model call was made and no performance claim is permitted.
