Prices per 1M tokens.

Standard

### Standard pricing data

| Model | Short context input | Short context cached input | Short context cache writes | Short context output | Long context input | Long context cached input | Long context cache writes | Long context output |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| gpt-5.6-sol | $5.00 | $0.50 | $6.25 | $30.00 | $10.00 | $1.00 | $12.50 | $45.00 |
| gpt-5.6-terra | $2.00 | $0.20 | $2.50 | $12.00 | $4.00 | $0.40 | $5.00 | $18.00 |
| gpt-5.6-luna | $0.20 | $0.02 | $0.25 | $1.20 | $0.40 | $0.04 | $0.50 | $1.80 |

Regional processing (data residency) endpoints are charged a 10% uplift for models released on or after March 5, 2026, that are eligible for data residency. See our [Your data](https://developers.openai.com/api/docs/guides/your-data) guide for supported regions and processing details. [OpenAI models in Amazon Bedrock](https://developers.openai.com/api/docs/guides/amazon-bedrock) are billed through AWS and may differ from direct OpenAI pricing. Priority processing was renamed Fast mode on July 30, 2026. You can use either `service_tier: "priority"` or `service_tier: "fast"` in your API requests. [Learn more about Fast mode](https://developers.openai.com/api/docs/guides/fast-mode).

### Grouped Pricing Table data

| Tool | Details | Pricing |
| --- | --- | --- |
| Web search | Web search (all models) | $10.00 / 1k calls + Search content tokens billed at model rates. |
| Web search | Image Web search (all models) | $10.00 / 1k calls + Search content tokens billed at model rates. |
| Web search | Web search preview (reasoning models, including `gpt-5`, `o-series`) | $10.00 / 1k calls + Search content tokens billed at model rates. |
| Web search | Web search preview (non-reasoning models) | $25.00 / 1k calls + Search content tokens are free. |
| Containers | Hosted Shell and Code Interpreter | 1 GB $0.03, 4 GB $0.12, 16 GB $0.48, 64 GB $1.92 per 20-minute session per container. |
| File search | Storage | $0.10 / GB per day (1 GB free) |
| File search | Tool call | $2.50 / 1k calls |
| Agent Kit | ChatKit file and image upload storage | $0.10 / GB-day after 1 GB free per account per month |

Tokens used for built-in tools are billed at the chosen model's per-token rates. GB refers to binary gigabytes (also known as gibibytes), where 1 GB is 2^30 bytes. Web search content tokens are tokens retrieved from the search index and fed to the model alongside your prompt to generate an answer. For gpt-4o-mini and gpt-4.1-mini with the non-preview web search tool, search content tokens are billed as a fixed block of 8,000 input tokens per call. File search tool call pricing applies to the Responses API only. Container pricing includes Hosted Shell and Code Interpreter. Eligible container sessions will be billed by the minute, with a 5-minute minimum per session. Responses API, Chat Completions API, Realtime API, Batch API, and Assistants API are not priced separately. Tokens are billed at the chosen model's input and output rates.
