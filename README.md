# mcp-omnisearch

[![built with vite+](https://img.shields.io/badge/built%20with-Vite+-646CFF?logo=vite&logoColor=white)](https://viteplus.dev)
[![tested with vitest](https://img.shields.io/badge/tested%20with-Vitest-6E9F18?logo=vitest&logoColor=white)](https://vitest.dev)

A Model Context Protocol (MCP) server for Tavily, Brave, Kagi, Exa,
GitHub, Linkup, and Firecrawl. Two tools, `search` and `execute`,
expose schema-generated native provider functions through Pi's local
QuickJS sandbox. Requires Node.js 22.19+.

<a href="https://glama.ai/mcp/servers/gz5wgmptd8">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/gz5wgmptd8/badge" alt="Glama badge" />
</a>

## Quick start

Install the published server with
[MCPick](https://github.com/spences10/mcpick):

```bash
npx mcpick add \
  --name mcp-omnisearch \
  --command npx \
  --args=-y,mcp-omnisearch
```

MCPick defaults to Claude Code. Use `--client` and `--scope` to target
another client or add the server to the current repository:

```bash
npx mcpick add \
  --name mcp-omnisearch \
  --command npx \
  --args=-y,mcp-omnisearch \
  --client vscode \
  --scope project
```

See
[Deployment](https://github.com/spences10/mcp-omnisearch/blob/main/docs/deployment.md#install-with-mcpick)
for supported clients and provider credential storage options.

To run from source instead:

```bash
pnpm install
pnpm run build
node ./dist/index.js
```

Providers without keys are skipped and the rest keep working. If your
client supports environment-variable expansion, reference keys instead
of storing their values in the MCP configuration:

```json
{
	"mcpServers": {
		"mcp-omnisearch": {
			"command": "npx",
			"args": ["-y", "mcp-omnisearch"],
			"env": {
				"TAVILY_API_KEY": "${TAVILY_API_KEY}",
				"EXA_API_KEY": "${EXA_API_KEY}"
			}
		}
	}
}
```

Add only the provider keys you use. Expansion syntax and secret
storage are client-specific; see
[Deployment](https://github.com/spences10/mcp-omnisearch/blob/main/docs/deployment.md#keep-provider-keys-out-of-mcp-configuration)
for secure options and plaintext fallback guidance.

## Tools

### `search`

Discover available functions and their compact TypeScript
declarations. A provider-scoped lookup returns names and schemas
together:

```json
{ "query": "tavily" }
```

Use an exact name such as `tavily_search` for a smaller lookup, or
`{}` for a catalog without declarations. Only configured providers
appear.

### `execute`

Run JavaScript against the discovered native provider functions:

```json
{
	"code": "const r = await tools.tavily_search({ query: 'MCP code mode', max_results: 3 }); return r.results.map(({ title, url }) => ({ title, url }));"
}
```

Compose calls with `await` and `Promise.all`, filter intermediate
data, and return only what the client needs. Credentials stay on the
host; the sandbox has no filesystem or arbitrary network access.
Arguments and responses use native provider formats, not a normalized
search contract. See
[Code Mode](https://github.com/spences10/mcp-omnisearch/blob/main/docs/codemode.md)
for functions, limits and benchmark findings.

## Upgrading

The consolidated `web_search`, `ai_search`, `web_extract` and
`github_search` tools have been removed. Provider keys stay the same,
but existing tool calls and client instructions need migration. See
the
[breaking-change migration guide](https://github.com/spences10/mcp-omnisearch/blob/main/docs/migration.md).

## Documentation

- [Migration](https://github.com/spences10/mcp-omnisearch/blob/main/docs/migration.md)
  — move from consolidated tools to Code Mode.
- [Code Mode](https://github.com/spences10/mcp-omnisearch/blob/main/docs/codemode.md)
  — native provider functions, schema generation, local testing, and
  benchmark findings.
- [Provider selection](https://github.com/spences10/mcp-omnisearch/blob/main/docs/provider-selection.md)
  — choose providers by task, key, mode, and capability.
- [Search operators](https://github.com/spences10/mcp-omnisearch/blob/main/docs/search-operators.md)
  — native query syntax and provider-specific filters.
- [Large results](https://github.com/spences10/mcp-omnisearch/blob/main/docs/large-results.md)
  — inline vs file response behavior and remote deployment caveats.
- [Deployment](https://github.com/spences10/mcp-omnisearch/blob/main/docs/deployment.md)
  — MCP client, WSL, and Firecrawl setup.
- [Troubleshooting](https://github.com/spences10/mcp-omnisearch/blob/main/docs/troubleshooting.md)
  — keys, access, validation, rate limits, and common failures.

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

Please read
[CONTRIBUTING.md](https://github.com/spences10/mcp-omnisearch/blob/main/CONTRIBUTING.md)
before opening a PR.

## License

MIT License - see
[LICENSE](https://github.com/spences10/mcp-omnisearch/blob/main/LICENSE).

## Acknowledgments

Built on
[Model Context Protocol](https://github.com/modelcontextprotocol),
[Tavily](https://tavily.com), [Kagi](https://kagi.com),
[Brave Search](https://search.brave.com), [Exa AI](https://exa.ai),
[Linkup](https://linkup.so), and [Firecrawl](https://firecrawl.dev).
