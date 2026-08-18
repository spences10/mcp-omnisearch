# Deployment

## MCP client configuration

### Install with MCPick

[MCPick](https://github.com/spences10/mcpick) can add the published
server without manually locating or editing a client configuration:

```bash
npx mcpick add \
  --name mcp-omnisearch \
  --command npx \
  --args=-y,mcp-omnisearch
```

It defaults to Claude Code. Target a supported client and repository
scope with `--client` and `--scope`, for example:

```bash
npx mcpick add \
  --name mcp-omnisearch \
  --command npx \
  --args=-y,mcp-omnisearch \
  --client vscode \
  --scope project
```

Supported client values include `claude-code`, `gemini-cli`, `vscode`,
`cursor`, `windsurf`, `opencode`, and `pi`. Run `npx mcpick clients`
to see the configuration paths available on your machine.

Keep provider credentials out of shell history by loading only the
keys you use with [nopeek](https://github.com/spences10/nopeek), then
having MCPick copy them from its environment:

```bash
pnpx nopeek run .env \
  --only TAVILY_API_KEY,EXA_API_KEY \
  -- npx mcpick add \
  --name mcp-omnisearch \
  --command npx \
  --args=-y,mcp-omnisearch \
  --from-env TAVILY_API_KEY,EXA_API_KEY
```

Replace that example key list with any providers you use. Add
`--dry-run --json` to preview the exact configuration diff without
writing it.

### Manual configuration

Configure only the API keys you have. Missing keys disable only their
matching providers.

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
				"FIRECRAWL_API_KEY": "your-firecrawl-key",
				"FIRECRAWL_BASE_URL": "http://localhost:3002"
			}
		}
	}
}
```

## Claude Desktop with WSL

Prefer putting provider keys in the MCP client's `env` object. If your
client cannot pass WSL environment variables directly, wrap startup in
a shell script inside WSL that exports the needed keys and then runs
`node /path/to/mcp-omnisearch/dist/index.js`.

```json
{
	"mcpServers": {
		"mcp-omnisearch": {
			"command": "wsl.exe",
			"args": ["bash", "-lc", "/path/to/start-mcp-omnisearch.sh"]
		}
	}
}
```

## Self-hosted Firecrawl

Set `FIRECRAWL_BASE_URL` to route Firecrawl modes to a self-hosted
instance:

```bash
# Example values:
# http://localhost:3002
# https://your-firecrawl-domain.com
```

Notes:

- If `FIRECRAWL_BASE_URL` is unset, Firecrawl cloud is used.
- Self-hosted instances should expose the same API endpoints, such as
  `/v1/scrape` and `/v1/crawl`.
- `FIRECRAWL_API_KEY` is still required.
