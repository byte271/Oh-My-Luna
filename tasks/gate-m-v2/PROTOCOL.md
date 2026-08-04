# Gate M protocol V2

```
protocol_version: gate-m-real-tasks-v2
freeze_id:        gate-m-real-tasks-v2-2026-08-02-pre-review
status:           pre_review
supersedes:       gate-m-real-tasks-2026-08-02-pre-review-v1 (provenance only)
```

V2 exists because V1 was superseded before any policy-eligible review. See
`tasks/gate-m/V1-STATUS.md` for V1's disposition; it is preserved intact.

Gate M is a **method-validation** gate. It is not a Luna capability experiment.
Nothing in V2 constitutes a capability, benchmark, or product result.

## What V2 keeps from V1

Unchanged, because none of it was in question and all of it reproduces:

- the four historical TypeScript defects, across three repositories;
- their base and corrected commits, and archive hashes;
- the evaluators and the deterministic base-fail / corrected-pass results;
- the repair diffs used as Phase 2 comparison material;
- the licenses and provenance records;
- the reviewer policy's **thresholds**, including the 0.8 L3/L4 collapse
  threshold, carried across unchanged so it cannot be accused of being retuned.

## What V2 changes

### 1. The review export no longer reveals the level

This is the substantive change. V1 exported bundles shaped as
`{context, localization, observation, diagnosis, plan}`, so the set of present
properties named the intended level mechanically. Any exact-level agreement
computed against that export would have measured schema recognition.

V2 flattens each packet into one uniform list:

```json
{
  "bundle_id": "gm2-<opaque>",
  "task_material": { "issue": "...", "base_version_excerpt": "..." },
  "candidate_information": [ { "item_id": "it-<opaque>", "kind": "statement", "text": "..." } ]
}
```

Every item has the same shape. Statement order, bundle order, bundle IDs, item
IDs and directory names are all derived by HMAC from a single frozen seed, so
the export is reproducible byte-for-byte while carrying no level information.
The seed is recorded in the freeze and in `review-control/`, never in the export.

Operational packets remain typed internally (`tasks/gate-m-v2/*/interventions/`).
Only the reviewer-facing representation is neutral.

**Residual cue, disclosed rather than hidden.** The design is cumulative, so
statement count correlates with level:

| Level | Statement counts across the four tasks |
| --- | --- |
| L1 | 1, 1, 1, 2 |
| L2 | 4, 4, 4, 6 |
| L3 | 5, 5, 7, 5 |
| L4 | 6, 8, 6, 6 |
| L5 | 14, 14, 14, 14 |

L5 is separable by count alone. This cannot be removed without falsifying the
corpus, so `review-control/policy.json` preregisters a **confound check**: before
exact-level agreement may be interpreted, it must be compared against a
classifier using statement count alone. If reviewer agreement does not clearly
exceed that baseline, exact-level agreement may not be reported as evidence of
semantic separability.

### 2. All four L5 packets re-authored as behavioral contracts

V1's L5 packets described mechanism — a marker to carry on a result, a modifier
to stop preserving, a lookahead condition to insert, and in one case a non-goal
that contradicted the reference repair. Four of four is a systematic authoring
pattern.

Each V2 L5 states required externally observable behavior, compatibility
requirements and non-goals, and names no field, flag, branch, modifier or
internal construct. Each was checked against: *could two materially different
implementations satisfy this?*

The zod-tuple non-goal "Do not change object-property default behavior" was
removed outright. It was false — the reference repair does change object
property handling — and it would have steered a solver away from the correction
for reasons unrelated to information level.

### 3. date-fns L4 diagnosis re-derived from evidence

V1's diagnosis described a single mechanism and explained only two of the four
observed results. `control/evidence/stage-trace.mjs` separates the locale's match
stage from its selection stage and shows two distinct defects on the base commit:

| Case | Match stage | Selected month |
| --- | --- | --- |
| numeric October | `no_match` | — |
| wide October | `no_match` | — |
| numeric November | matched `11月` | 1 |
| numeric December | matched `12月` | 1 |

October never matches; November and December match correctly and are then
mis-selected. The V2 diagnosis accounts for all four results and attributes each
to the correct stage. It states no repair.

### 4. type-fest L2 boundary names real symbols

V1 described the failing boundary in prose ("mapped property selection" →
"indexed key union"). V2 names `ConditionalKeys` and `NonNullable`, both visible
in the base excerpt, matching how the other three ladders are authored.

### 5. Clean-clone provisioning

`npm run gate-m:validate` did not reproduce from a clean clone. It now does:

```sh
npm ci
npm run gate-m:provision
npm run gate-m:validate
```

Provisioning verifies every pinned commit against its expected `git archive`
hash and the compiler against both published digests, rebuilds stale or dirty
worktrees, and fails with distinct codes rather than proceeding on unverified
inputs. Validation needs no environment variable and no network.

## Full change record

`CHANGES-FROM-V1.json` enumerates every difference with a reason. Every V2
packet records its V1 ancestor hash under `derived_from`.

## L3 and L4 remain provisional

V2 deliberately **retains** L3 and L4 as separate levels. The maintainer's
ineligible diagnostic review found them separable on all four ladders, but that
review is not the policy decision and cannot be treated as one — and it was
performed against the V1 export, whose structural cue made the judgment easier
than it should have been.

The point of V2 is to test whether independent reviewers can distinguish them
**after** the structural cue is removed. The 0.8 threshold and its qualitative
triggers are frozen. If two policy-eligible reviewers fall below it, L3 and L4
collapse in V3. The threshold must not be adjusted after results are seen.

## Reviewer requirements

Two reviewers, each `human` or `separately_operated_external_model`. The
maintainer session is explicitly ineligible, as is any subagent of it and any
second pass by an existing reviewer. Current count: **0 of 2**.

See `research/gate-m-reviews/SECOND-REVIEWER-PACKAGE.md`.
