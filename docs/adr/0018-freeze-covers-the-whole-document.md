# ADR 0018: The freeze seal covers the whole document, not a subset of it

## Context

`heldout:verify` is the gate every run passes through. `run-stage-a.mjs` aborts
with exit 30 if it fails, and the RUNBOOK, `SKILL.md` and `README.md` all present
its output — `checked=43 mismatched=0 aggregate=match` — as the statement that
the freeze is intact.

It was not that statement. `aggregate_sha256` is computed over exactly six
fields:

```js
sha256(JSON.stringify({ freeze_id, artifacts, corpus, prompts, model_settings, schedule }))
```

and `identity.json` is explicitly excluded from the artifact list
(`freeze.mjs:97`). So sixteen top-level fields were covered by nothing at all,
including every one that records a commitment rather than an input:

- `analysis_plan` — which contains `continuation_rule`, the single
  pre-registered decision the whole freeze exists to protect;
- `forbidden_claims` — the list of things a report may not say;
- `status`, `live_calls_made`, `capability_claim_permitted` — the execution
  counters a reader uses to check that nothing has been run;
- `arms`, `t3_is_combined`, `t3_note`, `leakage_controls`, `code_identity`,
  `environment`, `held_out_meaning`.

Established by experiment on 2026-08-04, not by reading. The continuation rule
was lowered from "at least two tasks where T0 fails" to "at least ONE task", the
Luna–Sol forbidden claim was deleted, `live_calls_made` was set to 999 and
`status` to `results_available`. Then:

```
$ node scripts/gate-h-heldout/freeze.mjs --verify
checked=43 mismatched=0 aggregate=match
$ echo $?
0
```

Every artifact hash matched, because no artifact had been touched. The tamper was
entirely inside the one file the artifact list omits.

This is a worse failure than a missing check, because the check that exists
*reports success* over the tampered fields. An operator reading `aggregate=match`
concludes the pre-registration holds. The fields a result-motivated edit would
target are exactly the fields that were unprotected, and lowering a continuation
rule after seeing a near-miss is the canonical form of that edit.

It is the same species as the defect this protocol version already exists to
repair. `check-prompt-completeness.mjs` was written because every existing
control verified integrity and none verified sufficiency. This one verified the
integrity of the inputs and none of the integrity of the *commitments*.

## Options

1. Leave it; rely on `git diff` to reveal edits at review time.
2. Add the uncovered fields to `aggregate_sha256`.
3. Add a second digest over the entire document, excluding only itself, and
   report coverage explicitly.
4. Move the analysis plan into a separate file and list it as an artifact.

## Evidence

Option 1 is what was already in place, and it is not nothing: the freeze is
committed, so an edit does appear in a diff. It failed anyway, because the
verifier's output is consumed at a different time and by a different reader than
the diff. A run aborts on exit 30 or proceeds on exit 0; nothing in that path
consults git.

Option 2 changes the meaning of `aggregate_sha256` for a value already published
in `README.md`, `RUNBOOK.md` and `research/gate-h-heldout/STATUS.md`, and would
make the v1 record unverifiable against its own documentation. The repository's
governing principle is that an outside reader can see what was believed, when,
and what changed it; silently redefining a published digest works against it.

Option 4 is the cleanest structurally and the most disruptive: it changes the
artifact count, and therefore the aggregate, and therefore requires re-freezing
v1 — which the project has committed not to do.

Option 3 leaves every published value intact and closes the gap.

## Decision

Adopt option 3.

`document_sha256` covers the canonical form of the entire freeze document with
only the digest field itself removed. `--verify` reports both digests and prints,
every time, which fields each one covers:

```
checked=43 mismatched=0 aggregate=match document=match
aggregate covers: freeze_id, artifacts, corpus, prompts, model_settings, schedule
aggregate does NOT cover (document digest does): schema_version, protocol_version,
created_at, status, live_calls_made, capability_claim_permitted, held_out_meaning,
code_identity, environment, arms, t3_is_combined, t3_note, analysis_plan,
leakage_controls, forbidden_claims, artifact_count
```

Printing the coverage unconditionally is deliberate. The original failure was not
that a hash was missing; it was that a true statement about six fields was read
as a statement about twenty-two. A verifier that names its own scope cannot be
misread that way.

`--seal` establishes a digest on a freeze written before sealing existed. It
refuses to overwrite a digest that is present and does not match, because that is
a tampered document rather than an unsealed one, and re-sealing would destroy the
only evidence.

The v1 freeze was sealed from a state confirmed clean against its committed blob
(`git diff --exit-code`), and the same tamper now fails:

```
checked=43 mismatched=0 aggregate=match document=DIFFERS
$ echo $?
1
```

## Consequences

This is tamper **evidence**, not tamper proofing, and the distinction is stated
wherever the seal is documented. An editor who also re-seals passes the check.
The seal is committed, so a re-seal appears in the diff — git remains the
underlying record. What the seal buys is that an in-place edit fails loudly at
the point of use, rather than silently until someone reviews a diff.

`heldout:verify` now exits 1 on an unsealed freeze rather than 0. Any future
freeze is sealed at write time and needs no separate step.

`aggregate_sha256` keeps its published value and its published meaning. A reader
comparing against `036d8390…` in the existing documents still finds it correct.

## Rejected alternatives

Option 1 is the status quo that failed. Option 2 breaks the published digest.
Option 4 requires re-freezing v1, which is precisely what the project declined to
do when the unseen-source defect was found — v1 stays exactly as frozen, with its
defects recorded against it.

## Reversal conditions

If a future freeze moves its analysis plan and forbidden-claims list into
separately hashed artifacts, the document digest becomes redundant with the
artifact list and may be dropped — but not before, and never by widening
`aggregate_sha256` in place.
