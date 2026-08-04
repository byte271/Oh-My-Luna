# Live provider adapter — status

```
transport:        implemented against the official SDK (openai@7.3.0, exact-pinned)
tests:            106 total suite; 33 transport/gate tests
live calls made:  0
cost incurred:    $0.00
live validation:  NOT RUN — no credential in this environment
status:           live_transport_unverified
```

`live_transport_unverified` means exactly this: the integration is implemented
and thoroughly tested against the installed SDK contract, and **it has never
been run against the provider.** It must not be described as a verified working
live adapter.

## What changed since the previous status

The earlier blocker — "official documentation could not be retrieved" — is
**resolved and no longer current**, though only partly by this environment.

Preserved as history: the documentation *sites* remain unreachable here.
`developers.openai.com` and `platform.openai.com` both fail CONNECT under this
environment's network policy. That was, and still is, true.

What changed is that the contract no longer depends on them:

- **The npm registry and the official `openai-node` repository are reachable.**
  The SDK is now installed exact-pinned at `7.3.0`, and its own TypeScript types
  are the authoritative request/response contract. This was verified here.
- **The remaining facts were supplied by the project owner** from an external
  retrieval and are recorded as owner-supplied, not as evidence I retrieved.

That split is recorded honestly in `data/provider-evidence/manifest.json`.

### Verified in this environment

From the installed SDK and the official SDK repository:

| Fact | Source |
| --- | --- |
| `gpt-5.6-luna` is a valid `ResponsesModel` | SDK type union |
| **No dated snapshot exists for it** — unlike e.g. `gpt-5.4-mini-2026-03-17` | SDK type union |
| `ReasoningEffort` = `none\|minimal\|low\|medium\|high\|xhigh\|max\|null` | `Shared.ReasoningEffort` |
| `store`, `max_output_tokens`, `tools`, `service_tier` request fields | `ResponseCreateParams` |
| `input_tokens_details.{cached_tokens,cache_write_tokens}` | `ResponseUsage` |
| `output_tokens_details.reasoning_tokens`, `total_tokens` | `ResponseUsage` |
| `_request_id` from the `x-request-id` header; `.withResponse()` | official README |
| SDK auto-retry defaults to **2**, settable to 0 | official README |
| Default timeout 10 minutes | official README |
| Error taxonomy and `APIError.requestID` | `core/error.d.ts` |

The SDK independently corroborates the no-snapshot constraint, so that claim
does not rest on owner assertion alone.

### Owner-supplied, not re-retrieved here

Endpoint `POST /v1/responses`; pricing $0.20 / $0.02 / $0.25 / $1.20 per 1M;
long-context threshold 272,000 input tokens; context window ≈1,050,000; max
output 128,000.

Pricing and the 272K threshold **match the pricing evidence already committed in
this repository**, whose hashes verify — corroboration, not independent
retrieval. Context window and max output have **no corroboration here** and rest
on owner assertion alone.

## Snapshot limitation

`gpt-5.6-luna` is used as a **mutable alias**. No immutable snapshot identifier
exists, so **exact model-weight reproducibility is not guaranteed.** Every
request records requested model, returned model, timestamp, SDK version and the
documentation-evidence id, so drift is at least detectable after the fact. This
is not the same as pinning, and it is never described as pinning.

## Transport behaviour, asserted by test

- **Request:** Responses API, `store: false`, `tools: []`, bounded
  `max_output_tokens`, frozen `reasoning.effort`, `X-Client-Request-Id` header.
- **SDK auto-retry disabled** (`maxRetries: 0`, client and per-request). One
  attempt is one provider submission — the default of 2 would hide extra
  billable submissions behind a single call.
- **Absent ≠ zero.** Every token field is `number | null`. A missing
  `cached_tokens` reports `null`, never `0`.
- **Both request IDs recorded** — the server's `_request_id` and a
  client-generated `oml-<uuid>`.
- **Uncertain calls are never retried.** A timeout after possible submission is
  recorded as `provider_outcome: unknown`, `billing_status: possibly_incurred`,
  and left for human investigation via the client request id. Retrying it could
  spend twice for one intended call.
- **Spending limits are not retryable.** `insufficient_quota` and
  `billing_hard_limit_reached` are separated from ordinary 429s.
- **Credentials never reach an error, receipt or log**, including when upstream
  error text contains the key.
- **Prose is a failure.** A fluent claim of completion carrying no applicable
  change is recorded as a failed attempt, not a partial success.
- **Paths are checked** — absolute paths, `..` escapes, and files outside the
  permitted set are rejected rather than applied.

## Authorization boundary

A live request runs only when **all three** are present in the environment:

```
OPENAI_API_KEY
OML_LIVE_APPROVED=1
OML_LIVE_BUDGET_USD=<positive limit>
```

None is committed. A prompt telling the agent to proceed is not approval — only
the environment is. Verified: with no credential the script exits 20 and never
constructs a client; with a credential and approval but no budget it still
refuses.

Before the provider is contacted, the script records requested model, task,
treatment, max output, reasoning effort, pessimistic maximum cost, remaining
budget, evidence id and SDK version. The budget guard runs **before** the call.

## Cost

`node scripts/gate-h/forecast-cost.mjs`:

| Scenario | Attempts | Forecast | Cap |
| --- | --- | --- | --- |
| One authorized T0 smoke call | 1 | $0.0108 | $0.05 |
| Held-out Stage A, 4 tasks | 16 | $0.532 | $1.59 |
| Held-out Stage A, 6 tasks | 24 | $0.797 | $2.39 |
| Contaminated 48-attempt fixture | 48 | $1.595 | **disabled** |

Estimates. Token counts are assumptions; no live call has been made.

## To run the one authorized call

```sh
OPENAI_API_KEY=… OML_LIVE_APPROVED=1 OML_LIVE_BUDGET_USD=0.05 \
  npm run gate-h:live-smoke
```

One task, one T0 attempt, no tools, no retries. It reports **`transport_valid`
and `task_success` separately** — a failed task with a valid receipt still
validates the transport. Nothing about model quality may be inferred from one
call, and live execution stops there.
