## Pricing

Pricing is based on the number of tokens used, or other metrics based on the model type. For tool-specific models, like search and computer use, there’s a fee per tool call. See details in the [pricing page](/api/docs/pricing).

### Text tokens

| Metric | Price | Unit |
| --- | ---: | --- |
| Input | $5 | 1M tokens |
| Cached input | $0.5 | 1M tokens |
| Output | $30 | 1M tokens |

- Prompts with >272K input tokens are priced at 2x input and 1.5x output for the full request.
- Cache writes are billed at 1.25x the uncached input token rate.
