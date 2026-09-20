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

Installation adds the server command. Configure provider credentials
separately with one of the methods below.

### Keep provider keys out of MCP configuration

MCP Omnisearch reads provider credentials from its process
environment. The MCP configuration does not need to contain literal
key values. Never commit provider credentials to a repository.

#### Environment references

Clients such as Claude Code can expand environment references in MCP
configuration. Set the keys in the client process environment or load
them with a secrets manager, then reference only their names:

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

Add only the keys you use. Expansion syntax is client-specific.
Confirm support in your client's documentation before using this
example. See
[Claude Code environment-variable expansion](https://code.claude.com/docs/en/mcp#environment-variable-expansion-in-mcp-json).

#### Native client secret storage

Prefer the client's protected secret store when it has one. VS Code
supports password inputs that it prompts for once and stores securely:

```json
{
	"inputs": [
		{
			"type": "promptString",
			"id": "tavily-api-key",
			"description": "Tavily API key",
			"password": true
		}
	],
	"servers": {
		"mcp-omnisearch": {
			"type": "stdio",
			"command": "npx",
			"args": ["-y", "mcp-omnisearch"],
			"env": {
				"TAVILY_API_KEY": "${input:tavily-api-key}"
			}
		}
	}
}
```

Add another password input for each provider you use. See the
[VS Code MCP configuration reference](https://code.visualstudio.com/docs/agents/reference/mcp-configuration#_input-variables-for-sensitive-data).
Other clients can provide different secret-storage mechanisms.

#### Plaintext fallback

MCPick can copy selected variables from its environment into a client
configuration. Use [nopeek](https://github.com/spences10/nopeek) to
avoid putting values in the command or exposing unrelated variables:

```bash
pnpx nopeek run .env \
  --only TAVILY_API_KEY,EXA_API_KEY \
  -- npx mcpick add \
  --name mcp-omnisearch \
  --command npx \
  --args=-y,mcp-omnisearch \
  --from-env TAVILY_API_KEY,EXA_API_KEY
```

`--from-env` writes the resolved values into the selected client's
configuration. It is not encrypted secret storage. Use it only when
that risk is acceptable, restrict access to the configuration file,
and never commit the file. Add `--dry-run --json` to inspect the
configuration change before writing it.

## Claude Desktop with WSL

Keep provider keys in the WSL environment or load them through a
secrets manager. If the client cannot pass WSL environment variables
directly, use a startup script inside WSL to load them and then run
`node /path/to/mcp-omnisearch/dist/index.js`. Do not put literal keys
in a committed startup script.

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
