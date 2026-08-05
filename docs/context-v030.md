# v0.3.0 — long context: instrument first, mechanism second

**Status: the instrument and the mechanism are built and tested. The claim they
exist to settle is still unsettled, because it needs live model calls this
repository has never made.**

## The claim

The owner's premise for this version:

> Luna has a very large context window, but once the context grows it gets
> confused. That is what to improve.

That has two halves. The first — a 1.05M-token window — is recorded in
`research/luna-sol-gap.md`. The second — that quality degrades as the context
fills — is **an assertion, not a measurement**, exactly as the effort-parity
claim was before `data/provider-evidence/effort-parity-2026-08-03.json` pinned
it down.

Building a fix for an unmeasured failure produces a mechanism that cannot be
shown to help, and cannot be shown not to. So the order here is: instrument
first, and an instrument that can return *"no degradation detected"* and
falsify the premise cheaply.

## The instrument — `src/probes/context-degradation.ts`

A verifiable fact (the *needle*) is placed at a controlled relative depth in
filler, and a question answerable only from that fact is asked. Recall is scored
by exact match on a token the filler cannot contain.

Two axes, because they fail differently and need different fixes:

| axis | question | shape when it fails |
|---|---|---|
| **size** | how much surrounds the needle | `degrades_with_size` |
| **depth** | where the needle sits, 0.0 head → 1.0 tail | `degrades_in_middle` |

A third axis, **distractors**, is separate rather than folded in: real
long-context failure is usually confusion between the needle and near-identical
filler, not distance alone. Filler that shares the needle's *shape* but not its
value isolates that cause.

Shapes: `no_degradation_detected` · `degrades_with_size` · `degrades_in_middle` ·
`degrades_with_size_and_in_middle` · `fails_everywhere`.

`fails_everywhere` exists so that 0% recall is reported as *"check the needle is
answerable at all"* rather than dressed up as a context finding.

### The controls are part of the module, not just the tests

```
$ npm run probe:context

=== controls: the probe MUST separate these before any result is read ===

  ok   perfect                  no_degradation_detected
  ok   blind                    fails_everywhere
  ok   mid_blind                degrades_in_middle
  ok   size_limited             degrades_with_size
  ok   perfect +distractors     no_degradation_detected
  ok   distractible +distractors fails_everywhere
  → controls separated: all 6 controls classified as expected across 4 distinct
    shapes; the distractor axis moves a shape-matcher and not a value-reader
```

`runSelfCheck()` is exported and the script **exits 1 without printing any
measurement** if the controls do not separate. This is the growth probe's lesson
applied before rather than after: that probe shipped with `indeterminate`
covering both "too fast to measure" and "too slow to finish", and gave a
catastrophic implementation the same verdict as two sound ones. Its positive
control found it — afterwards.

The distractor check is deliberately two-sided. An axis that changes nothing is
broken; so is one that breaks every responder, because then any negative result
can be blamed on distractors. It must move the shape-matcher **and leave the
value-reader alone**.

## The mechanism — `src/context/compile.ts`

A prompt cannot enforce a budget, cannot report what it dropped, and cannot be
A/B tested against itself with content held constant. `compileContext` takes
scored documents and a token budget and returns a context plus a manifest.

Position policies:

| policy | placement | addresses |
|---|---|---|
| `as_ranked` | most relevant first | the control — no positional theory applied |
| `edge_loaded` | alternating head/tail, weakest in the middle | a measured `degrades_in_middle` |
| `tail_loaded` | most relevant last, nearest the instruction | recency-weighted attention |

### The property that makes a policy A/B meaningful

**Changing the policy changes ordering and nothing else.** Membership — and
therefore the token total — is decided before any policy runs. Without that, an
A/B between policies also varies the content and any measured difference is
uninterpretable: the same confound that voided the first scoring run of
comparison 02. It is asserted in `tests/context-compile.test.ts`, together with
its converse — that the policies do produce *different* orderings, so the knob is
connected to something.

### Two ways not to fit, treated differently

- **`exceeds_budget_alone`** — cannot fit at any ranking. Skipped; the fill
  continues. Its fate does not depend on anything above it, so skipping is
  stable, and stopping would let one oversized file blank the whole context.
- **`over_budget`** — did not fit in what was left. This *stops* the fill, and
  everything below is excluded too, including documents that would have fit.
  Continuing would promote a lower-ranked document past a higher-ranked one
  purely for being smaller, making membership depend on byte sizes — so an
  unrelated edit reshuffles the context and two runs stop being comparable.

### What is mechanically checked

- the emitted text never exceeds the budget, under every policy and budget tested;
- every input document appears **exactly once** in `included` or `excluded` — a
  document that is in neither has vanished, which is the harness's own recurring
  integrity-versus-sufficiency defect in a new place;
- the same input compiles byte-identically, and input order does not matter when
  scores tie;
- a pin outranks a higher-scoring document, and is **never** honoured by
  breaching the budget — it is refused with `exceeds_budget_alone` instead;
- the manifest caps its listing but still accounts for every document it does not
  name.

### Measurement selects the mechanism

`recommendPolicy(shape)` maps a *measured* shape to a policy. It returns
`as_ranked` — do nothing — for `no_degradation_detected`, and for
`degrades_with_size`, where the honest advice is "the fix is fewer tokens, not
different tokens." For `fails_everywhere` it says to fix the probe before
changing the mechanism. A recommender that always suggested rearranging would be
presenting a hypothesis as a finding.

## Does the recommended policy help? — `src/probes/policy-ab.ts`

`recommendPolicy` recommended; nothing checked the recommendation was right.
That left the mechanism where the skill was before comparison 02 was scored:
plausible, deployed, unverified.

`comparePolicies` runs the same question against the same documents compiled
under each policy. `sweepNeedleRank` walks the needed document down the ranking
and reports how far each policy reaches. For a responder with a **known**
mid-context blind spot, over 20 documents:

```
perfect:
  as_ranked    reaches rank 20   recalled: 1..20
  edge_loaded  reaches rank 20   recalled: 1..20
  tail_loaded  reaches rank 20   recalled: 1..20

mid_blind:
  as_ranked    reaches rank  3   recalled: 1,2,3,18,19,20
  edge_loaded  reaches rank  6   recalled: 1,2,3,4,5,6
  tail_loaded  reaches rank  3   recalled: 1,2,3,18,19,20
```

**This is not circular.** The compiler knows nothing about the responder; it
reorders by rank. Whether that rescues a positional weakness depends on where
the ranker put the needed document — a mechanical fact that could have come out
either way, and comes out differently for the three policies.

Two things to read off it:

1. **The perfect responder must be unaffected by policy.** It is. If it were
   not, the arms would differ in *content*, not just order, and every row would
   be unreadable. This is the integration-level form of the compiler's
   membership test.
2. **Every policy recalls the same *number* of ranks — six.** The count of edge
   slots is a property of the context, not of the policy. What differs is who
   spends them: `as_ranked` gives three of its six to the three *least* relevant
   documents in the corpus, because "most relevant first" also means "least
   relevant last, at the other edge". `edge_loaded` gives all six to the top six.

So the mechanism's honest statement is a number and a limit: **reach 3 → 6, and
beyond rank 6 no reordering helps at all.** Past that, `comparePolicies` returns
`recalled_nowhere` and says so — "this is the limit of the mechanism, not a
tuning problem."

Reach is counted **contiguously from rank 1**. `as_ranked` does recall rank 20,
because that document sits at the tail; counting it would report a reach of 20
and overstate the mechanism sixfold.

### What this makes measurable that was not

The joint quantity: **ranker quality × policy**. `edge_loaded` can only pull a
document to an edge if the ranker scored it in the top few. A better ranker and
a better policy are substitutes over this range, and the sweep prices them in
the same unit.

## What is NOT claimed

- **Not claimed: `edge_loaded` helps Luna, or any model.** The reach 3 → 6
  result is measured against a *synthetic* responder whose blind spot was
  defined, not discovered. It shows the mechanism does what it claims when the
  weakness is present; it says nothing about whether any real model has it.
  No policy has been run against a real model. The repository has made zero
  live calls.
- **Not claimed: the reach number transfers.** It was measured on 20
  equal-sized documents. Equal sizes are deliberate — with mixed lengths a
  document's depth *in lines* stops tracking its position in the ordering, and
  the comparison would confound placement with file size. Real corpora are not
  equal-sized.
- **Not claimed: Luna degrades with context.** The premise remains an owner
  assertion. The instrument that could settle it now exists and can falsify it.
- **Not claimed: this exceeds Sol or Opus-5.** Nothing here measures either.

## What would settle it

One live run per arm over the size × depth grid, with the arm's own reported
`tools_available`, k≥5 repetitions per cell, and the policy comparison run with
membership held constant. The comparison is then a single flag, because
`compileContext` already guarantees the content is identical across policies.
That is the same gap recorded for the skill A/B: without repetitions the
question is not answerable, and answering it anyway is how the first scoring run
went wrong.
