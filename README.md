# mcp-omnisearch

[![built with vite+](https://img.shields.io/badge/built%20with-Vite+-646CFF?logo=vite&logoColor=white)](https://viteplus.dev)
[![tested with vitest](https://img.shields.io/badge/tested%20with-Vitest-6E9F18?logo=vitest&logoColor=white)](https://vitest.dev)

A Model Context Protocol (MCP) server that provides unified access to
multiple search providers and AI tools. This server combines the
capabilities of Tavily, Brave, Kagi, Exa AI, GitHub, Linkup, and
Firecrawl to offer comprehensive search, AI responses, and content
processing through four consolidated tools.

<a href="https://glama.ai/mcp/servers/gz5wgmptd8">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/gz5wgmptd8/badge" alt="Glama badge" />
</a>

## Features

### 🔍 `web_search` — Web Search

Search the web for information. Providers: tavily (factual/citations),
brave (privacy/operators), kagi (quality/operators), exa
(AI-semantic), kagi_enrichment (specialized indexes).

Parameters:

- `query` (string, required): Search query
- `provider` (string, required): `tavily`, `brave`, `kagi`, `exa`, or
  `kagi_enrichment`
- `limit` (number, optional): Maximum number of results (default: 10)
- `include_domains` (array, optional): Only return results from these
  domains
- `exclude_domains` (array, optional): Exclude results from these
  domains

### 🤖 `ai_search` — AI-Powered Answers

Get AI-powered answers with citations and reasoning. Providers:
kagi_fastgpt (fast ~900ms answers), exa_answer (semantic AI), linkup
(deep agentic search with sources).

Parameters:

- `query` (string, required): Question or search query
- `provider` (string, required): `kagi_fastgpt`, `exa_answer`, or
  `linkup`
- `limit` (number, optional): Maximum number of results (default: 10)

### 🔎 `github_search` — GitHub Search

Search GitHub for code, repositories, or users. Supports advanced
syntax: `filename:`, `path:`, `repo:`, `user:`, `language:`,
`in:file`.

Parameters:

- `query` (string, required): Search query
- `search_type` (string, optional): `code`, `repositories`, or `users`
  (default: code)
- `limit` (number, optional): Maximum number of results (default: 10)
- `sort` (string, optional): `stars`, `forks`, or `updated`
  (repositories only)

### 📄 `web_extract` — Content Extraction and Processing

Extract, process, or summarize web content from URLs. Providers:
tavily (content extraction), kagi (summarization of
pages/videos/podcasts), firecrawl
(scraping/crawling/mapping/structured extraction/interactive), exa
(content retrieval/similar pages).

Parameters:

- `url` (string or array, required): URL or array of URLs to process
- `provider` (string, required): `tavily`, `kagi`, `firecrawl`, or
  `exa`
- `mode` (string, optional): Processing mode. Firecrawl:
  scrape/crawl/map/extract/actions. Exa: contents/similar. Tavily:
  extract. Kagi: summarize. Defaults to provider default.
- `extract_depth` (string, optional): `basic` or `advanced` (default:
  basic)

### 🎯 Search Operators

MCP Omnisearch provides powerful search capabilities through operators
and parameters:

#### Search Operator Reference

**Brave & Kagi Operators** (use in query string):

- **Domain**: `site:example.com`, `-site:example.com`
- **File type**: `filetype:pdf` or `ext:pdf`
- **Location**: `intitle:term`, `inurl:term`, `inbody:term`,
  `inpage:term`
- **Language**: `lang:en` (ISO 639-1 codes)
- **Country**: `loc:us` (ISO 3166-1 codes)
- **Date**: `before:2024`, `after:2024-01-01`
- **Exact**: `"exact phrase"`
- **Include/Exclude**: `+required`, `-excluded`

**Tavily** (API parameters only):

- Domain filtering: `include_domains`, `exclude_domains`

#### Example Usage

```typescript
// Brave/Kagi: Advanced operators in query
{
  "query": "filetype:pdf lang:en site:microsoft.com +typescript -javascript",
  "provider": "brave"
}

// Brave/Kagi: Search gists
{
  "query": "site:gist.github.com claude code settings",
  "provider": "brave"
}

// Tavily: API parameters for domain filtering
{
  "query": "typescript guide",
  "provider": "tavily",
  "include_domains": ["microsoft.com"]
}
```

#### Provider Capabilities

- **Brave Search**: Full native operator support in query string
- **Kagi Search**: Complete operator support in query string
- **Tavily Search**: Domain filtering through API parameters
- **Exa Search**: Domain filtering through API parameters, semantic
  search with neural understanding
- **GitHub Search**: Advanced code search syntax with qualifiers:
  - `filename:remote.ts` - Search for specific files
  - `path:src/lib` - Search within specific directories
  - `repo:user/repo` - Search within specific repositories
  - `user:username` - Search within a user's repositories
  - `language:typescript` - Filter by programming language
  - `in:file "export function"` - Search for text within files

## Flexible API Key Requirements

MCP Omnisearch is designed to work with the API keys you have
available. You don't need to have keys for all providers - the server
will automatically detect which API keys are available and only enable
those providers.

For example:

- If you only have a Tavily and Brave API key, only those providers
  will be available
- If you don't have a Kagi API key, Kagi-based services won't be
  available, but all other providers will work normally
- The server will log which providers are available based on the API
  keys you've configured

This flexibility makes it easy to get started with just one or two
providers and add more as needed.

## Configuration

This server requires configuration through your MCP client. Here are
examples for different environments:

### Cline Configuration

Add this to your Cline MCP settings:

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
				"GITHUB_API_KEY": "your-github-key",
				"EXA_API_KEY": "your-exa-key",
				"LINKUP_API_KEY": "your-linkup-key",
				"FIRECRAWL_API_KEY": "your-firecrawl-key",
				"FIRECRAWL_BASE_URL": "http://localhost:3002"
			},
			"disabled": false,
			"autoApprove": []
		}
	}
}
```

### Claude Desktop with WSL Configuration

For WSL environments, add this to your Claude Desktop configuration:

```json
{
	"mcpServers": {
		"mcp-omnisearch": {
			"command": "wsl.exe",
			"args": [
				"bash",
				"-c",
				"TAVILY_API_KEY=key1 KAGI_API_KEY=key2 BRAVE_API_KEY=key3 GITHUB_API_KEY=key4 EXA_API_KEY=key5 LINKUP_API_KEY=key6 FIRECRAWL_API_KEY=key7 FIRECRAWL_BASE_URL=http://localhost:3002 node /path/to/mcp-omnisearch/dist/index.js"
			]
		}
	}
}
```

### Environment Variables

The server uses API keys for each provider. **You don't need keys for
all providers** - only the providers corresponding to your available
API keys will be activated:

- `TAVILY_API_KEY`: For Tavily Search and content extraction
- `KAGI_API_KEY`: For Kagi services (Search, FastGPT, Summarizer,
  Enrichment)
- `BRAVE_API_KEY`: For Brave Search
- `GITHUB_API_KEY`: For GitHub search services (Code, Repository, User
  search)
- `EXA_API_KEY`: For Exa AI services (Search, Answer, Contents,
  Similar)
- `LINKUP_API_KEY`: For Linkup AI search with sourced answers
- `FIRECRAWL_API_KEY`: For Firecrawl services (Scrape, Crawl, Map,
  Extract, Actions)
- `FIRECRAWL_BASE_URL`: For self-hosted Firecrawl instances (optional,
  defaults to Firecrawl cloud service)

You can start with just one or two API keys and add more later as
needed. The server will log which providers are available on startup.

### GitHub API Key Setup

To use GitHub search features, you'll need a GitHub personal access
token with **public repository access only** for security:

1. **Go to GitHub Settings**: Navigate to
   [GitHub Settings > Developer settings > Personal access tokens](https://github.com/settings/tokens)

2. **Create a new token**: Click "Generate new token" → "Generate new
   token (classic)"

3. **Configure token settings**:
   - **Name**: `MCP Omnisearch - Public Search`
   - **Expiration**: Choose your preferred expiration (90 days
     recommended)
   - **Scopes**: **Leave all checkboxes UNCHECKED**

     ⚠️ **Important**: Do not select any scopes. An empty scope token
     can only access public repositories and user profiles, which is
     exactly what we want for search functionality.

4. **Generate and copy**: Click "Generate token" and copy the token
   immediately

5. **Add to environment**: Set `GITHUB_API_KEY=your_token_here`

**Security Notes**:

- This token configuration ensures no access to private repositories
- Only public code search, repository discovery, and user profiles are
  accessible
- Rate limits: 5,000 requests/hour for code search, 10 requests/minute
  for code search specifically
- You can revoke the token anytime from GitHub settings if needed

### Self-Hosted Firecrawl Configuration

If you're running a self-hosted instance of Firecrawl, you can
configure MCP Omnisearch to use it by setting the `FIRECRAWL_BASE_URL`
environment variable. This allows you to maintain complete control
over your data processing pipeline.

**Self-hosted Firecrawl setup:**

1. Follow the
   [Firecrawl self-hosting guide](https://docs.firecrawl.dev/contributing/self-host)
2. Set up your Firecrawl instance (default runs on
   `http://localhost:3002`)
3. Configure MCP Omnisearch with your self-hosted URL:

```bash
FIRECRAWL_BASE_URL=http://localhost:3002
# or for a remote self-hosted instance:
FIRECRAWL_BASE_URL=https://your-firecrawl-domain.com
```

**Important notes:**

- If `FIRECRAWL_BASE_URL` is not set, MCP Omnisearch will default to
  the Firecrawl cloud service
- Self-hosted instances support the same API endpoints (`/v1/scrape`,
  `/v1/crawl`, etc.)
- You'll still need a `FIRECRAWL_API_KEY` even for self-hosted
  instances
- Self-hosted Firecrawl provides enhanced security and customization
  options

## API

The server exposes 4 consolidated MCP tools. Each tool dispatches to
the provider you select:

### web_search

Search the web for information.

```json
{
	"query": "latest developments in quantum computing",
	"provider": "tavily"
}
```

```json
{
	"query": "rust programming language features site:github.com",
	"provider": "brave",
	"limit": 15
}
```

```json
{
	"query": "latest AI research papers",
	"provider": "exa",
	"include_domains": ["arxiv.org", "scholar.google.com"]
}
```

### ai_search

Get AI-powered answers with citations.

```json
{
	"query": "Explain the differences between REST and GraphQL",
	"provider": "kagi_fastgpt"
}
```

```json
{
	"query": "How does machine learning work?",
	"provider": "exa_answer"
}
```

```json
{
	"query": "What are the latest advances in quantum computing?",
	"provider": "linkup"
}
```

### github_search

Search GitHub for code, repositories, or users.

```json
{
	"query": "filename:remote.ts @sveltejs/kit",
	"search_type": "code",
	"limit": 5
}
```

```json
{
	"query": "sveltekit remote functions",
	"search_type": "repositories",
	"sort": "stars"
}
```

```json
{
	"query": "Rich-Harris",
	"search_type": "users",
	"limit": 3
}
```

### web_extract

Extract, process, or summarize web content from URLs.

```json
{
	"url": "https://example.com/long-article",
	"provider": "kagi",
	"mode": "summarize"
}
```

```json
{
	"url": [
		"https://example.com/article1",
		"https://example.com/article2"
	],
	"provider": "tavily"
}
```

```json
{
	"url": "https://example.com",
	"provider": "firecrawl",
	"mode": "crawl",
	"extract_depth": "advanced"
}
```

```json
{
	"url": "https://arxiv.org/abs/2106.09685",
	"provider": "exa",
	"mode": "similar"
}
```

## Docker Deployment

MCP Omnisearch supports containerized deployment using Docker with
MCPO (Model Context Protocol Over HTTP) integration, enabling cloud
deployment and OpenAPI access.

### Quick Start with Docker

1. **Using Docker Compose (Recommended)**:

```bash
# Clone the repository
git clone https://github.com/spences10/mcp-omnisearch.git
cd mcp-omnisearch

# Create .env file with your API keys
echo "TAVILY_API_KEY=your-tavily-key" > .env
echo "KAGI_API_KEY=your-kagi-key" >> .env
echo "BRAVE_API_KEY=your-brave-key" >> .env
echo "EXA_API_KEY=your-exa-key" >> .env
echo "GITHUB_API_KEY=your-github-key" >> .env
# Add other API keys as needed
echo "LINKUP_API_KEY=your-linkup-key" >> .env

# Start the container
docker-compose up -d
```

2. **Using Docker directly**:

```bash
docker build -t mcp-omnisearch .
docker run -d \
  -p 8000:8000 \
  -e TAVILY_API_KEY=your-tavily-key \
  -e KAGI_API_KEY=your-kagi-key \
  -e BRAVE_API_KEY=your-brave-key \
  -e EXA_API_KEY=your-exa-key \
  -e GITHUB_API_KEY=your-github-key \
  -e LINKUP_API_KEY=your-linkup-key \
  --name mcp-omnisearch \
  mcp-omnisearch
```

### Container Environment Variables

Configure the container using environment variables for each provider:

- `TAVILY_API_KEY`: For Tavily Search and content extraction
- `KAGI_API_KEY`: For Kagi services (Search, FastGPT, Summarizer,
  Enrichment)
- `BRAVE_API_KEY`: For Brave Search
- `GITHUB_API_KEY`: For GitHub search services
- `EXA_API_KEY`: For Exa AI services
- `LINKUP_API_KEY`: For Linkup AI search
- `FIRECRAWL_API_KEY`: For Firecrawl services
- `FIRECRAWL_BASE_URL`: For self-hosted Firecrawl instances (optional)
- `PORT`: Container port (defaults to 8000)

### OpenAPI Access

Once deployed, the MCP server is accessible via OpenAPI at:

- **Base URL**: `http://your-container-host:8000`
- **OpenAPI Endpoint**: `/omnisearch`
- **Compatible with**: OpenWebUI and other tools expecting OpenAPI

### Cloud Deployment

The containerized version can be deployed to any container platform
that supports Docker:

- Cloud Run (Google Cloud)
- Container Instances (Azure)
- ECS/Fargate (AWS)
- Railway, Render, Fly.io
- Any Kubernetes cluster

Example deployment to a cloud platform:

```bash
# Build and tag for your registry
docker build -t your-registry/mcp-omnisearch:latest .
docker push your-registry/mcp-omnisearch:latest

# Deploy with your platform's CLI or web interface
# Configure environment variables through your platform's settings
```

## Development

### Setup

1. Clone the repository
2. Install dependencies:

```bash
pnpm install
```

3. Build the project:

```bash
pnpm run build
```

4. Run in development mode:

```bash
pnpm run dev
```

### Publishing

1. Update version in package.json
2. Build the project:

```bash
pnpm run build
```

3. Publish to npm:

```bash
pnpm publish
```

## Troubleshooting

### API Keys and Access

Each provider requires its own API key and may have different access
requirements:

- **Tavily**: Requires an API key from their developer portal
- **Kagi**: Some features limited to Business (Team) plan users
- **Brave**: API key from their developer portal
- **GitHub**: Personal access token with **no scopes selected**
  (public access only)
- **Exa AI**: API key from their dashboard at
  [dashboard.exa.ai](https://dashboard.exa.ai)
- **Linkup**: API key from their developer portal
- **Firecrawl**: API key required from their developer portal

### Rate Limits

Each provider has its own rate limits. The server will handle rate
limit errors gracefully and return appropriate error messages.

## Contributing

Please read CONTRIBUTING.md before opening a PR. In short:

- Start by opening an issue to propose your change and align scope.
- Prefer small, focused PRs with a clear explanation (problem →
  approach → verification).
- Follow provider conventions: use `src/common/http.ts` (`http_json`)
  for HTTP, read keys from `src/config/env.ts`, respect timeouts, and
  surface errors via `ProviderError`.

## License

MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

Built on:

- [Model Context Protocol](https://github.com/modelcontextprotocol)
- [Tavily Search](https://tavily.com)
- [Kagi Search](https://kagi.com)
- [Brave Search](https://search.brave.com)
- [Exa AI](https://exa.ai)
- [Linkup](https://linkup.so)
- [Firecrawl](https://firecrawl.dev)
