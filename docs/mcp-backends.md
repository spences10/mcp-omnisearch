# Optional downstream MCP backends

Direct HTTP adapters remain the default. Operators who already run an
official remote MCP (for example through ToolHive) can register that
server as an extra `web_search` provider. Omnisearch then owns
timeouts and result mapping; vendor auth and tool schemas stay in the
official server.

Set `OMNISEARCH_MCP_BACKENDS` to a JSON object keyed by provider id.
Bad mappings fail startup. A successful path that returns an empty
list is a real empty result. A path or field alias that does not match
the tool payload fails the request with `MALFORMED_RESPONSE` instead
of an empty mystery list.

`$NAME` references are supported only as the entire string value.
`Bearer $EXA_API_KEY` is left unchanged on purpose. Missing names fail
configuration.

## Official remote example: Exa

```json
{
	"exa_mcp": {
		"transport": {
			"url": "https://mcp.exa.ai/mcp",
			"headers": {
				"x-api-key": "$EXA_API_KEY"
			}
		},
		"tool": "web_search_exa",
		"query_argument": "query",
		"limit_argument": "numResults",
		"result_path": ["results"],
		"field_aliases": {
			"title": ["title"],
			"url": ["url"],
			"snippet": ["text", "snippet"],
			"score": ["score"]
		},
		"timeout": 30000,
		"estimated_cost": 0
	}
}
```

`result_path` is applied to `structuredContent` or to JSON text
returned by the tool. It must resolve to an array of objects with
title and URL after aliases. If a remote returns only formatted prose,
wrap it or point `result_path` at a JSON list; do not expect
Omnisearch to guess.

Use `web_search` with `"provider": "exa_mcp"`. The built-in `exa` HTTP
adapter is unchanged.

## Stdio example

```json
{
	"local_search": {
		"command": "npx",
		"args": ["-y", "some-search-mcp"],
		"env": {
			"API_KEY": "$SEARCH_API_KEY"
		},
		"tool": "search",
		"query_argument": "query",
		"limit_argument": "max_results",
		"result_path": ["results"],
		"timeout": 20000,
		"estimated_cost": 0.01
	}
}
```

`env` is valid only with `command`. Remote headers belong on
`transport`. A backend id cannot reuse a built-in HTTP adapter id
(`tavily`, `brave`, `kagi`, `exa`, `kagi_enrichment`).
