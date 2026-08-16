# Result quality

`web_search` applies an optional quality layer after the selected
provider returns results. The default is conservative: known content
mirrors are dropped, and extra hits from the same registrable domain
are moved behind more diverse results.

## What it does

- Drops known Stack Overflow / GitHub / documentation mirrors and SEO
  scrapers. The builtin list can be extended with `blocked_domains` or
  `OMNISEARCH_BLOCKED_DOMAINS`.
- Caps results per registrable domain (default 2). The first hits keep
  their provider order; overflow is appended, not deleted.
- Skips the domain cap for `site:` queries and `include_domains`.
  Constrained hosts are also kept even if they appear on the
  blocklist, so a deliberate `site:newbedev.com` search is not
  "fixed".
- Reports what changed in `metadata.spam_filtered`.

## Disable or override

```json
{
	"query": "fastapi upload example",
	"provider": "brave",
	"filter_spam": false,
	"max_results_per_domain": 0
}
```

Per-request fields override environment defaults:

- `filter_spam` — default `true`, or `OMNISEARCH_FILTER_SPAM`
- `max_results_per_domain` — default `2`, or
  `OMNISEARCH_MAX_RESULTS_PER_DOMAIN`. `0` disables the cap.
- `blocked_domains` — extra hosts to drop, merged with
  `OMNISEARCH_BLOCKED_DOMAINS`
- `allowed_domains` — rescue hosts from the blocklist, merged with
  `OMNISEARCH_ALLOWED_DOMAINS`

## Response shape

```json
{
	"results": [
		{
			"title": "Example",
			"url": "https://example.com",
			"snippet": "Example result",
			"source_provider": "brave"
		}
	],
	"metadata": {
		"spam_filtered": {
			"removed_count": 1,
			"domains": ["newbedev.com"],
			"demoted_count": 0
		}
	}
}
```

`removed_count` / `domains` are dropped mirrors. `demoted_count` is
how many results were moved behind the diverse head.
