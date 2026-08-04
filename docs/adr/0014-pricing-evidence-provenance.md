# ADR 0014: Hash captured pricing evidence, not only parsed values

## Context

Official pricing pages are mutable. A hash of manually transcribed JSON proves
only that the transcription did not change, not what the source displayed.

## Options

1. Keep a parsed snapshot with URLs.
2. Archive the entire page.
3. Preserve bounded source excerpts plus hashes, parser identity, extracted
   values, omissions, and limitations.

## Evidence

The official Markdown endpoints expose auditable pricing tables and model rules
but no immutable version or signature. Full-page captures add unrelated mutable
content and copyright/storage burden.

## Decision

Adopt option 3. Record each canonical URL and timezone-aware retrieval time,
hash exact committed excerpt bytes, hash the parser code, reparse rates, and
state all excluded service-tier and tool costs.

## Consequences

The evidence is reproducible within the repository and mutation is detectable.
It still cannot prove the upstream document because capture selection is manual
and unsigned; the limitation is explicit.

## Rejected alternatives

Option 1 lacks source evidence. Option 2 is noisier and still cannot prove
upstream authenticity.

## Reversal conditions

Prefer an official signed, versioned, machine-readable pricing API if OpenAI
publishes one.

