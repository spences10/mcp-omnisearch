# Research mode

`web_search` stays single-provider by default. Set `mode` to
`research` only when you want a deeper, more expensive pass.

## What it does

1. Fans out the same query to several eligible configured search
   providers. The requested `provider` is tried first. Specialized
   indexes such as `kagi_enrichment` are included only when they are
   the requested provider.
2. Deduplicates results by normalized URL (first provider wins) and
   keeps at most `limit` rows (default 10).
3. Optionally extracts a bounded set of top URLs through an existing
   `web_extract` provider. Preference order: Tavily extract, Firecrawl
   scrape, Exa contents, Kagi summarize.
4. Honors a best-effort `research_time_budget` (default 55 seconds,
   range 1–75). The budget is checked before launching more search
   providers and before extract.

## Partial results and early-stop

Research mode does not fail the whole call when a later provider or
extract step fails. Search hits that already arrived are returned with
diagnostics.

After two providers have contributed unique URLs, remaining in-flight
providers are abandoned and labeled `early_stop`. Providers that were
never launched after the budget ran out are labeled
`time_budget_exhausted`. In-flight work that exceeds the remaining
budget is listed in `timed_out`.

The response is an object, not a bare result array.

Request:

```json
{
	"query": "turntable reviews under 1000",
	"provider": "brave",
	"mode": "research",
	"research_time_budget": 45,
	"research_extract": true,
	"research_extract_count": 3
}
```

Response:

```json
{
	"mode": "research",
	"results": [
		{
			"title": "Example review",
			"url": "https://example.com",
			"snippet": "...",
			"source_provider": "brave"
		}
	],
	"extracts": {
		"content": "...",
		"source_provider": "tavily_extract"
	},
	"research": {
		"time_budget_seconds": 45,
		"elapsed_ms": 1200,
		"selected": ["brave", "tavily"],
		"succeeded": ["brave"],
		"failed": [{ "provider": "tavily", "error": "..." }],
		"skipped": [],
		"timed_out": [],
		"extract": {
			"provider": "tavily:extract",
			"status": "succeeded",
			"urls": ["https://example.com"]
		}
	}
}
```

`research_extract` defaults to `true` in research mode.
`research_extract_count` defaults to 3 (max 10).

## Cost

Research mode can call several search APIs plus one extract API. Keep
daily search on a single `provider` without `mode: "research"`.
