# mcp-omnisearch

## 0.0.19

### Patch Changes

- 81573f7: Large results saved to tmp with section index for LLM file
  navigation

## 0.0.18

### Patch Changes

- 09e7fd7: Deduplicate Firecrawl providers with shared utility
  functions
- 2efd54e: Deduplicate query construction logic between Brave and Kagi
  providers
- 9145b10: Fix site: operator by removing parentheses in Brave and
  Kagi query construction
- be9a14d: Refactor: consolidate error handling and utilities
- 4746562: Refactor: standardize error handling

## 0.0.17

### Patch Changes

- 845649b: Enhanced Web Search with Provider-Specific Operators

## 0.0.16

### Patch Changes

- 732a8fd: Consolidate 20 MCP tools into 8

## 0.0.15

### Patch Changes

- correct mcp name

## 0.0.14

### Patch Changes

- d32dcf1: mcp registry setup

## 0.0.13

### Patch Changes

- 0c1d3da: swap mcp/sdk with tmcp

## 0.0.12

### Patch Changes

- 047898a: Refactor Kagi enrichment and Firecrawl providers to
  http_json with timeouts
- 3b529b0: Refactor three providers to http_json; unify auth and error
  handling, config and run prettier
- 8d7fd35: fix exa features
- efa419e: Refactor Perplexity, Kagi FastGPT, Jina providers to
  http_json

## 0.0.11

### Patch Changes

- df090fc: add exa.ai features
- 8b18293: remove exa research feature

## 0.0.10

### Patch Changes

- 9bab891: doesn't break if no GitHub key added

## 0.0.9

### Patch Changes

- 8002c78: feat: add GitHub search provider integration
  - Updated package.json and pnpm-lock.yaml to include Octokit for
    GitHub API interactions.
  - Enhanced SearchResult interface to include optional metadata
    field.
  - Added GITHUB_API_KEY to environment configuration.
  - Implemented GitHubSearchProvider class for searching code,
    repositories, and users on GitHub.
  - Registered GitHub-specific search tools in the tool registry with
    custom handling for search requests.

## 0.0.8

### Patch Changes

- 50ac221: added firecrawl shelf host env variable

## 0.0.7

### Patch Changes

- 95e671f: update documentation

## 0.0.6

### Patch Changes

- feat: add Docker support with MCPO integration for cloud deployment

## 0.0.5

### Patch Changes

- 295f28b: Add search operator support and update provider
  descriptions

## 0.0.4

### Patch Changes

- add firecrawl feature

## 0.0.3

### Patch Changes

- 0d937fa: Add Tavily Extract Provider for web content extraction

## 0.0.2

### Patch Changes

- ability to use individual API keys

## 0.0.1

### Patch Changes

- initial release
