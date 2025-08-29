[![MseeP.ai Security Assessment Badge](https://mseep.net/pr/spences10-mcp-omnisearch-badge.png)](https://mseep.ai/app/spences10-mcp-omnisearch)

# mcp-omnisearch

A Model Context Protocol (MCP) server that provides unified access to
multiple search providers and AI tools. This server combines the
capabilities of Tavily, Perplexity, Kagi, Jina AI, Brave, and
Firecrawl to offer comprehensive search, AI responses, content
processing, and enhancement features through a single interface.

<a href="https://glama.ai/mcp/servers/gz5wgmptd8">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/gz5wgmptd8/badge" alt="Glama badge" />
</a>

## Features

### 🔍 Search Tools

- **Tavily Search**: Optimized for factual information with strong
  citation support. Supports domain filtering through API parameters
  (include_domains/exclude_domains).
- **Brave Search**: Privacy-focused search with good technical content
  coverage. Features native support for search operators (site:,
  -site:, filetype:, intitle:, inurl:, before:, after:, and exact
  phrases).
- **Kagi Search**: High-quality search results with minimal
  advertising influence, focused on authoritative sources. Supports
  search operators in query string (site:, -site:, filetype:,
  intitle:, inurl:, before:, after:, and exact phrases).
- **GitHub Search**: Comprehensive code search across public GitHub
  repositories with three specialized tools:
  - **Code Search**: Find code examples, function definitions, and
    files using advanced syntax (`filename:`, `path:`, `repo:`,
    `user:`, `language:`, `in:file`)
  - **Repository Search**: Discover repositories with sorting by
    stars, forks, or recent updates
  - **User Search**: Find GitHub users and organizations

### 🎯 Search Operators

MCP Omnisearch provides powerful search capabilities through operators
and parameters:

#### Common Search Features

- Domain filtering: Available across all providers
  - Tavily: Through API parameters (include_domains/exclude_domains)
  - Brave & Kagi: Through site: and -site: operators
- File type filtering: Available in Brave and Kagi (filetype:)
- Title and URL filtering: Available in Brave and Kagi (intitle:,
  inurl:)
- Date filtering: Available in Brave and Kagi (before:, after:)
- Exact phrase matching: Available in Brave and Kagi ("phrase")

#### Example Usage

```typescript
// Using Brave or Kagi with query string operators
{
  "query": "filetype:pdf site:microsoft.com typescript guide"
}

// Using Tavily with API parameters
{
  "query": "typescript guide",
  "include_domains": ["microsoft.com"],
  "exclude_domains": ["github.com"]
}
```

#### Provider Capabilities

- **Brave Search**: Full native operator support in query string
- **Kagi Search**: Complete operator support in query string
- **Tavily Search**: Domain filtering through API parameters
- **GitHub Search**: Advanced code search syntax with qualifiers:
  - `filename:remote.ts` - Search for specific files
  - `path:src/lib` - Search within specific directories
  - `repo:user/repo` - Search within specific repositories
  - `user:username` - Search within a user's repositories
  - `language:typescript` - Filter by programming language
  - `in:file "export function"` - Search for text within files

### 🤖 AI Response Tools

- **Perplexity AI**: Advanced response generation combining real-time
  web search with GPT-4 Omni and Claude 3
- **Kagi FastGPT**: Quick AI-generated answers with citations (900ms
  typical response time)

### 📄 Content Processing Tools

- **Jina AI Reader**: Clean content extraction with image captioning
  and PDF support
- **Kagi Universal Summarizer**: Content summarization for pages,
  videos, and podcasts
- **Tavily Extract**: Extract raw content from single or multiple web
  pages with configurable extraction depth ('basic' or 'advanced').
  Returns both combined content and individual URL content, with
  metadata including word count and extraction statistics
- **Firecrawl Scrape**: Extract clean, LLM-ready data from single URLs
  with enhanced formatting options
- **Firecrawl Crawl**: Deep crawling of all accessible subpages on a
  website with configurable depth limits
- **Firecrawl Map**: Fast URL collection from websites for
  comprehensive site mapping
- **Firecrawl Extract**: Structured data extraction with AI using
  natural language prompts
- **Firecrawl Actions**: Support for page interactions (clicking,
  scrolling, etc.) before extraction for dynamic content

### 🔄 Enhancement Tools

- **Kagi Enrichment API**: Supplementary content from specialized
  indexes (Teclis, TinyGem)
- **Jina AI Grounding**: Real-time fact verification against web
  knowledge

## Flexible API Key Requirements

MCP Omnisearch is designed to work with the API keys you have
available. You don't need to have keys for all providers - the server
will automatically detect which API keys are available and only enable
those providers.

For example:

- If you only have a Tavily and Perplexity API key, only those
  providers will be available
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
				"PERPLEXITY_API_KEY": "your-perplexity-key",
				"KAGI_API_KEY": "your-kagi-key",
				"JINA_AI_API_KEY": "your-jina-key",
				"BRAVE_API_KEY": "your-brave-key",
				"GITHUB_API_KEY": "your-github-key",
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
				"TAVILY_API_KEY=key1 PERPLEXITY_API_KEY=key2 KAGI_API_KEY=key3 JINA_AI_API_KEY=key4 BRAVE_API_KEY=key5 GITHUB_API_KEY=key6 FIRECRAWL_API_KEY=key7 FIRECRAWL_BASE_URL=http://localhost:3002 node /path/to/mcp-omnisearch/dist/index.js"
			]
		}
	}
}
```

### Environment Variables

The server uses API keys for each provider. **You don't need keys for
all providers** - only the providers corresponding to your available
API keys will be activated:

- `TAVILY_API_KEY`: For Tavily Search
- `PERPLEXITY_API_KEY`: For Perplexity AI
- `KAGI_API_KEY`: For Kagi services (FastGPT, Summarizer, Enrichment)
- `JINA_AI_API_KEY`: For Jina AI services (Reader, Grounding)
- `BRAVE_API_KEY`: For Brave Search
- `GITHUB_API_KEY`: For GitHub search services (Code, Repository, User
  search)
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

The server implements MCP Tools organized by category:

### Search Tools

#### search_tavily

Search the web using Tavily Search API. Best for factual queries
requiring reliable sources and citations.

Parameters:

- `query` (string, required): Search query

Example:

```json
{
	"query": "latest developments in quantum computing"
}
```

#### search_brave

Privacy-focused web search with good coverage of technical topics.

Parameters:

- `query` (string, required): Search query

Example:

```json
{
	"query": "rust programming language features"
}
```

#### search_kagi

High-quality search results with minimal advertising influence. Best
for finding authoritative sources and research materials.

Parameters:

- `query` (string, required): Search query
- `language` (string, optional): Language filter (e.g., "en")
- `no_cache` (boolean, optional): Bypass cache for fresh results

Example:

```json
{
	"query": "latest research in machine learning",
	"language": "en"
}
```

#### github_search

Search for code on GitHub using advanced syntax. This tool searches
through file contents in public repositories and provides code
snippets with metadata.

Parameters:

- `query` (string, required): Search query with GitHub search syntax
- `limit` (number, optional): Maximum number of results (1-50,
  default: 10)

Example:

```json
{
	"query": "filename:remote.ts @sveltejs/kit",
	"limit": 5
}
```

Advanced query examples:

- `"filename:config.json path:src"` - Find config.json files in src
  directories
- `"function fetchData language:typescript"` - Find fetchData
  functions in TypeScript
- `"repo:microsoft/vscode extension"` - Search within specific
  repository
- `"user:torvalds language:c"` - Search user's repositories for C code

#### github_repository_search

Discover GitHub repositories with enhanced metadata including stars,
forks, language, and last update information.

Parameters:

- `query` (string, required): Repository search query
- `limit` (number, optional): Maximum number of results (1-50,
  default: 10)
- `sort` (string, optional): Sort results by 'stars', 'forks', or
  'updated'

Example:

```json
{
	"query": "sveltekit remote functions",
	"sort": "stars",
	"limit": 5
}
```

#### github_user_search

Find GitHub users and organizations with profile information.

Parameters:

- `query` (string, required): User/organization search query
- `limit` (number, optional): Maximum number of results (1-50,
  default: 10)

Example:

```json
{
	"query": "Rich-Harris",
	"limit": 3
}
```

### AI Response Tools

#### ai_perplexity

AI-powered response generation with real-time web search integration.

Parameters:

- `query` (string, required): Question or topic for AI response

Example:

```json
{
	"query": "Explain the differences between REST and GraphQL"
}
```

#### ai_kagi_fastgpt

Quick AI-generated answers with citations.

Parameters:

- `query` (string, required): Question for quick AI response

Example:

```json
{
	"query": "What are the main features of TypeScript?"
}
```

### Content Processing Tools

#### process_jina_reader

Convert URLs to clean, LLM-friendly text with image captioning.

Parameters:

- `url` (string, required): URL to process

Example:

```json
{
	"url": "https://example.com/article"
}
```

#### process_kagi_summarizer

Summarize content from URLs.

Parameters:

- `url` (string, required): URL to summarize

Example:

```json
{
	"url": "https://example.com/long-article"
}
```

#### process_tavily_extract

Extract raw content from web pages with Tavily Extract.

Parameters:

- `url` (string | string[], required): Single URL or array of URLs to
  extract content from
- `extract_depth` (string, optional): Extraction depth - 'basic'
  (default) or 'advanced'

Example:

```json
{
	"url": [
		"https://example.com/article1",
		"https://example.com/article2"
	],
	"extract_depth": "advanced"
}
```

Response includes:

- Combined content from all URLs
- Individual raw content for each URL
- Metadata with word count, successful extractions, and any failed
  URLs

#### firecrawl_scrape_process

Extract clean, LLM-ready data from single URLs with enhanced
formatting options.

Parameters:

- `url` (string | string[], required): Single URL or array of URLs to
  extract content from
- `extract_depth` (string, optional): Extraction depth - 'basic'
  (default) or 'advanced'

Example:

```json
{
	"url": "https://example.com/article",
	"extract_depth": "basic"
}
```

Response includes:

- Clean, markdown-formatted content
- Metadata including title, word count, and extraction statistics

#### firecrawl_crawl_process

Deep crawling of all accessible subpages on a website with
configurable depth limits.

Parameters:

- `url` (string | string[], required): Starting URL for crawling
- `extract_depth` (string, optional): Extraction depth - 'basic'
  (default) or 'advanced' (controls crawl depth and limits)

Example:

```json
{
	"url": "https://example.com",
	"extract_depth": "advanced"
}
```

Response includes:

- Combined content from all crawled pages
- Individual content for each page
- Metadata including title, word count, and crawl statistics

#### firecrawl_map_process

Fast URL collection from websites for comprehensive site mapping.

Parameters:

- `url` (string | string[], required): URL to map
- `extract_depth` (string, optional): Extraction depth - 'basic'
  (default) or 'advanced' (controls map depth)

Example:

```json
{
	"url": "https://example.com",
	"extract_depth": "basic"
}
```

Response includes:

- List of all discovered URLs
- Metadata including site title and URL count

#### firecrawl_extract_process

Structured data extraction with AI using natural language prompts.

Parameters:

- `url` (string | string[], required): URL to extract structured data
  from
- `extract_depth` (string, optional): Extraction depth - 'basic'
  (default) or 'advanced'

Example:

```json
{
	"url": "https://example.com",
	"extract_depth": "basic"
}
```

Response includes:

- Structured data extracted from the page
- Metadata including title, extraction statistics

#### firecrawl_actions_process

Support for page interactions (clicking, scrolling, etc.) before
extraction for dynamic content.

Parameters:

- `url` (string | string[], required): URL to interact with and
  extract content from
- `extract_depth` (string, optional): Extraction depth - 'basic'
  (default) or 'advanced' (controls complexity of interactions)

Example:

```json
{
	"url": "https://news.ycombinator.com",
	"extract_depth": "basic"
}
```

Response includes:

- Content extracted after performing interactions
- Description of actions performed
- Screenshot of the page (if available)
- Metadata including title and extraction statistics

### Enhancement Tools

#### enhance_kagi_enrichment

Get supplementary content from specialized indexes.

Parameters:

- `query` (string, required): Query for enrichment

Example:

```json
{
	"query": "emerging web technologies"
}
```

#### enhance_jina_grounding

Verify statements against web knowledge.

Parameters:

- `statement` (string, required): Statement to verify

Example:

```json
{
	"statement": "TypeScript adds static typing to JavaScript"
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
echo "PERPLEXITY_API_KEY=your-perplexity-key" >> .env
# Add other API keys as needed
echo "GITHUB_API_KEY=your-github-key" >> .env

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
  -e PERPLEXITY_API_KEY=your-perplexity-key \
  -e GITHUB_API_KEY=your-github-key \
  --name mcp-omnisearch \
  mcp-omnisearch
```

### Container Environment Variables

Configure the container using environment variables for each provider:

- `TAVILY_API_KEY`: For Tavily Search
- `PERPLEXITY_API_KEY`: For Perplexity AI
- `KAGI_API_KEY`: For Kagi services (FastGPT, Summarizer, Enrichment)
- `JINA_AI_API_KEY`: For Jina AI services (Reader, Grounding)
- `BRAVE_API_KEY`: For Brave Search
- `GITHUB_API_KEY`: For GitHub search services
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
- **Perplexity**: API access through their developer program
- **Kagi**: Some features limited to Business (Team) plan users
- **Jina AI**: API key required for all services
- **Brave**: API key from their developer portal
- **GitHub**: Personal access token with **no scopes selected**
  (public access only)
- **Firecrawl**: API key required from their developer portal

### Rate Limits

Each provider has its own rate limits. The server will handle rate
limit errors gracefully and return appropriate error messages.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

Built on:

- [Model Context Protocol](https://github.com/modelcontextprotocol)
- [Tavily Search](https://tavily.com)
- [Perplexity AI](https://perplexity.ai)
- [Kagi Search](https://kagi.com)
- [Jina AI](https://jina.ai)
- [Brave Search](https://search.brave.com)
- [Firecrawl](https://firecrawl.dev)
