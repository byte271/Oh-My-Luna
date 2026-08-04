# Pricing provenance

Status: verified source-backed observation at retrieval time  
Retrieved: 2026-08-02T00:49:04-04:00 (America/New_York)

The official OpenAI [pricing page](https://developers.openai.com/api/docs/pricing)
and model pages for [GPT-5.6 Luna](https://developers.openai.com/api/docs/models/gpt-5.6-luna)
and [GPT-5.6 Sol](https://developers.openai.com/api/docs/models/gpt-5.6-sol)
listed Standard short-context prices per million tokens as follows:

| Model | Input | Cached input | Cache write | Output |
|---|---:|---:|---:|---:|
| GPT-5.6 Luna | $0.20 | $0.02 | $0.25 | $1.20 |
| GPT-5.6 Sol | $5.00 | $0.50 | $6.25 | $30.00 |

The observed Standard ratio is 25:1 for all four categories. Both model pages
state that requests above 272K input tokens charge 2x input and 1.5x output for
the full request and cache writes cost 1.25x uncached input. The pricing page
also lists tool and container charges; run accounting cannot treat token cost
as total cost.

`data/pricing/openai-2026-08-02.evidence.json` records exact URLs, timestamp,
capture method, bounded raw excerpts, hashes, parser identity, extracted values,
derived ratios, omissions, and limitations. The validator hashes the captured
source bytes and parser code, reparses model rows, checks rules and fixed tool
charges, and rejects mutation. This is stronger than hashing parsed JSON, but
not cryptographic proof of the mutable upstream page: the excerpts were
selected manually and OpenAI provides no signed document version in the page.

The prior `openai-2026-08-01.json` remains historical. It contained the same
observed token prices but insufficient source provenance and must not be the
sole input to a new cost analysis.

