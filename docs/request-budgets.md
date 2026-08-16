# Request budgets

Optional request-level caps for multi-provider plans. They exist so
fan-out cannot become an accidental bill. **Single-provider calls
ignore these knobs** and keep the current cheap path.

Available on `web_search`, `ai_search`, and `web_extract`.

## Knobs

| Argument          | Default (multi-provider only) | Purpose                                                                 |
| ----------------- | ----------------------------- | ----------------------------------------------------------------------- |
| `max_providers`   | `3`                           | Maximum providers to run. A max, not a min.                             |
| `timeout_seconds` | `20`                          | Whole-call wall time. Remaining provider work is cancelled on timeout.  |
| `budget_usd`      | unset                         | Estimated USD cap. Impossible plans fail before any provider is called. |

`github_search` is always one provider, so it does not accept these
fields.

## Single-provider no-op

```json
{
	"query": "sveltekit remote functions",
	"provider": "brave",
	"budget_usd": 0,
	"timeout_seconds": 1,
	"max_providers": 1
}
```

This still runs Brave. A one-provider plan does not apply the USD
check or the whole-call timeout. Per-HTTP timeouts from
`src/config/env.ts` still apply.

## Multi-provider plans

When a later orchestrator (or a caller) passes more than one candidate
provider:

1. Cap the list at `max_providers` (default 3), preserving caller
   order.
2. Sum per-provider **estimated** USD.
3. If `budget_usd` is set and the sum is greater, throw
   `INVALID_INPUT` immediately. No provider HTTP runs.
4. Otherwise run under `timeout_seconds` (default 20).

Estimates are planner hints, not invoices. They live in
`src/common/request-budgets.ts` and can be updated when vendor pricing
changes.

| Provider / mode                                                         | Estimated USD |
| ----------------------------------------------------------------------- | ------------- |
| `brave`                                                                 | 0.005         |
| `tavily`                                                                | 0.008         |
| `exa`                                                                   | 0.007         |
| `kagi`, `kagi_enrichment`, `kagi_fastgpt`                               | 0.01          |
| `exa_answer`                                                            | 0.01          |
| `linkup`                                                                | 0.012         |
| `github`                                                                | 0             |
| `tavily:extract`, `kagi:summarize`, `firecrawl:scrape`, `firecrawl:map` | 0.01          |
| `exa:contents`, `exa:similar`                                           | 0.005         |
| `firecrawl:extract`, `firecrawl:actions`                                | 0.02          |
| `firecrawl:crawl`                                                       | 0.05          |
| unknown                                                                 | 0.01          |

## Example

A two-provider plan of Brave + Tavily estimates `$0.013`. With
`budget_usd: 0.01` the planner throws `INVALID_INPUT` before either
vendor is contacted. Raise `budget_usd`, drop a provider, or pin a
single `provider` to proceed.
