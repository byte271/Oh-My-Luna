# Gate M V2 blinded review export

This directory is the complete reviewer-facing export. Hand a reviewer this
subtree and nothing else.

Each opaque directory is one bundle: the issue as a maintainer would see it, a
bounded excerpt of the base version, a list of candidate information statements,
an exact repair diff for Phase 2 comparison, and a blank answer form.

- `RUBRIC.md` — the classification rubric. Read it first.
- `bundles/<opaque-id>/bundle.json` — task material and statements.
- `bundles/<opaque-id>/repair-comparison.patch` — **Phase 2 only.** Do not open
  it until your Phase 1 answers are written and hashed.
- `bundles/<opaque-id>/answer-template.json` — the form to fill in.

## What is deliberately absent

No bundle carries its intended level. Every statement is emitted in the same
uniform shape, so the presence or absence of a kind of information cannot be
read off the structure. Statement order, bundle order, bundle identifiers and
directory names are all derived from a frozen seed that is not included here.

You will not receive author notes, another reviewer's answers, the packet-to-level
mapping, repository history, or pull request discussion.

## Known limitation, stated up front

The underlying design is **cumulative**: a higher level contains everything the
lower levels contain, plus more. The number of statements in a bundle therefore
correlates with its level, and that correlation is not removable without
falsifying the corpus.

Concretely, in this export the statement counts per level are:

| Level | Statement counts across the four tasks |
| --- | --- |
| L1 | 1, 1, 1, 2 |
| L2 | 4, 4, 4, 6 |
| L3 | 5, 5, 7, 5 |
| L4 | 6, 8, 6, 6 |
| L5 | 14, 14, 14, 14 |

L1 and L5 are largely separable by count alone; L3 and L4 overlap. This is
disclosed so that nobody — reviewer or analyst — mistakes count-driven agreement
for semantic agreement. The analysis plan preregisters a confound check against
a count-only classifier for exactly this reason.

**Classify from the sentences.** If you find yourself counting, say so in your
limitations.

## The repair diff

`repair-comparison.patch` is reviewer-only material. It exists so you can judge
how close a bundle comes to the actual correction. It must never enter a model
task workspace, and it must not be opened during Phase 1.

## Status

No independent review has been completed under V2. Every `answer-template.json`
is a blank form, not a review record.
