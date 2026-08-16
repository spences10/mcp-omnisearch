# Result fusion

When more than one provider result list is present, Omnisearch
canonicalizes identity and fuses ranks with reciprocal rank fusion
(RRF). A single provider list is returned unchanged.

This is the merge step for optional multi-provider fan-out. Current
`web_search` still takes one `provider` and therefore still returns a
plain list.

## Identity

Hits collapse when they share a canonical URL, or a canonical title
when the URL is empty.

URL canonicalization:

- lowercase scheme and host
- drop default ports and fragments
- drop a trailing slash
- drop tracking query keys (`utm_*`, `fbclid`, `gclid`)
- sort remaining query parameters

## Reciprocal rank fusion

Each provider list contributes `1 / (k + rank)` with **1-based**
ranks. The fused score is the sum of those contributions.

`k` defaults to **60**, the usual RRF constant. Override it with
`OMNISEARCH_RRF_K` (positive integer). Invalid values fall back to 60.

The fused list is capped by the existing `limit` argument.

## Provenance

Fused hits include `sources[]`:

```json
{
	"title": "Example",
	"url": "https://example.com/docs",
	"snippet": "…",
	"score": 0.0325,
	"source_provider": "brave",
	"sources": [
		{ "provider": "brave", "rank": 2, "score": 0.2 },
		{ "provider": "tavily", "rank": 1, "score": 0.8 }
	]
}
```

`score` on the fused hit is the RRF score. `sources[].score` is the
optional original provider score. Single-provider responses do not add
`sources`.
