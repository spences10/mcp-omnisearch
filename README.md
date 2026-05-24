# mcp-omnisearch

[![built with vite+](https://img.shields.io/badge/built%20with-Vite+-646CFF?logo=vite&logoColor=white)](https://viteplus.dev)
[![tested with vitest](https://img.shields.io/badge/tested%20with-Vitest-6E9F18?logo=vitest&logoColor=white)](https://vitest.dev)

A Model Context Protocol (MCP) server that provides unified access to
Tavily, Brave, Kagi, Exa AI, GitHub, Linkup, and Firecrawl through
four consolidated tools.

<a href="https://glama.ai/mcp/servers/gz5wgmptd8">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/gz5wgmptd8/badge" alt="Glama badge" />
</a>

## Quick start

```bash
pnpm install
pnpm run build
node ./dist/index.js
```

Configure the server in your MCP client with whichever provider keys
you have. Providers without keys are skipped and the rest keep
working.

```json
{
	"mcpServers": {
		"mcp-omnisearch": {
			"command": "node",
			"args": ["/path/to/mcp-omnisearch/dist/index.js"],
			"env": {
				"TAVILY_API_KEY": "your-tavily-key",
				"KAGI_API_KEY": "your-kagi-key",
				"BRAVE_API_KEY": "your-brave-key",
				"GITHUB_API_KEY": "your-github-token",
				"EXA_API_KEY": "your-exa-key",
				"LINKUP_API_KEY": "your-linkup-key",
				"FIRECRAWL_API_KEY": "your-firecrawl-key"
			}
		}
	}
}
```

## Tools

### `web_search`

Search the web with Tavily, Brave, Kagi, Exa, or Kagi Enrichment.

```json
{
	"query": "sveltekit remote functions site:docs.svelte.dev",
	"provider": "brave",
	"limit": 10
}
```

### `ai_search`

Get sourced AI answers with Kagi FastGPT, Exa Answer, or Linkup.

```json
{
	"query": "Explain the differences between REST and GraphQL",
	"provider": "kagi_fastgpt"
}
```

### `github_search`

Search GitHub code, repositories, or users.

```json
{
	"query": "filename:remote.ts @sveltejs/kit",
	"search_type": "code",
	"limit": 5
}
```

### `web_extract`

Extract, crawl, scrape, summarize, or find similar content with
Tavily, Kagi, Firecrawl, or Exa.

```json
{
	"url": "https://example.com/long-article",
	"provider": "kagi",
	"mode": "summarize"
}
```

## Documentation

- [Provider selection](docs/provider-selection.md) — choose providers
  by task, key, mode, and capability.
- [Search operators](docs/search-operators.md) — operator support
  matrix and tested examples.
- [Large results](docs/large-results.md) — inline vs file response
  behavior and remote deployment caveats.
- [Deployment](docs/deployment.md) — MCP client, WSL, Docker, cloud,
  and Firecrawl setup.
- [Troubleshooting](docs/troubleshooting.md) — keys, access,
  validation, rate limits, and common failures.

## Environment variables

- `TAVILY_API_KEY`
- `KAGI_API_KEY`
- `BRAVE_API_KEY`
- `GITHUB_API_KEY`
- `EXA_API_KEY`
- `LINKUP_API_KEY`
- `FIRECRAWL_API_KEY`
- `FIRECRAWL_BASE_URL` optional, for self-hosted Firecrawl
- `OMNISEARCH_LARGE_RESULT_MODE` optional, `file` default or `inline`

## Development

```bash
pnpm install
pnpm run build
pnpm test
```

Please read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a PR.

## License

MIT License - see [LICENSE](LICENSE).

## Acknowledgments

Built on
[Model Context Protocol](https://github.com/modelcontextprotocol),
[Tavily](https://tavily.com), [Kagi](https://kagi.com),
[Brave Search](https://search.brave.com), [Exa AI](https://exa.ai),
[Linkup](https://linkup.so), and [Firecrawl](https://firecrawl.dev).
