# Provider selection

MCP Omnisearch registers only providers with configured API keys. Use
the smallest provider that matches the job, then switch providers when
you need a different ranking style, operator model, or processing
mode.

## Search providers

| Provider          | API key          | Best for                                                              | Operators and filters                                                                                                               |
| ----------------- | ---------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `brave`           | `BRAVE_API_KEY`  | Privacy-oriented web search, native search operators, exact discovery | Passes rich operators through in the query string and merges `include_domains` / `exclude_domains` into `site:` / `-site:` clauses. |
| `youcom`          | `YDC_API_KEY`    | Fresh web and news search with a simple opt-in HTTP interface         | Passes query operators through unchanged and returns raw web/news results for downstream ranking or synthesis.                           |
| `kagi`            | `KAGI_API_KEY`   | High-quality web results and focused research                         | Preserves query operators, uses Kagi request parameters for `filetype:` and `before:` / `after:` dates.                             |
| `tavily`          | `TAVILY_API_KEY` | Factual/cited search and API-native filtering                         | Translates supported operators into Tavily fields: domains, dates, exact phrases, and country.                                      |
| `exa`             | `EXA_API_KEY`    | Semantic/neural search and discovery                                  | Supports domain filters through request parameters; optimized for meaning rather than exact operator syntax.                        |
| `kagi_enrichment` | `KAGI_API_KEY`   | Specialized Kagi enrichment indexes                                   | Use when enrichment/specialized-index results are desired rather than general web results.                                          |

## AI answer providers

| Provider       | API key          | Best for                                       |
| -------------- | ---------------- | ---------------------------------------------- |
| `kagi_fastgpt` | `KAGI_API_KEY`   | Fast sourced answers.                          |
| `exa_answer`   | `EXA_API_KEY`    | Semantic AI answers grounded in Exa retrieval. |
| `linkup`       | `LINKUP_API_KEY` | Deep agentic search with sources.              |

## GitHub provider

| Provider        | API key          | Search types                    | Syntax                                                                                        |
| --------------- | ---------------- | ------------------------------- | --------------------------------------------------------------------------------------------- |
| `github_search` | `GITHUB_API_KEY` | `code`, `repositories`, `users` | GitHub qualifiers such as `filename:`, `path:`, `repo:`, `user:`, `language:`, and `in:file`. |

Use a GitHub personal access token with no scopes selected for public
search only. See
[troubleshooting](troubleshooting.md#github-token-setup).

## Processing providers

| Provider    | API key             | Modes                                          | Best for                                                                   |
| ----------- | ------------------- | ---------------------------------------------- | -------------------------------------------------------------------------- |
| `tavily`    | `TAVILY_API_KEY`    | `extract`                                      | Content extraction with optional `extract_depth`.                          |
| `kagi`      | `KAGI_API_KEY`      | `summarize`                                    | Summaries of pages, videos, and podcasts.                                  |
| `firecrawl` | `FIRECRAWL_API_KEY` | `scrape`, `crawl`, `map`, `extract`, `actions` | Scraping, crawling, site maps, structured extraction, and browser actions. |
| `exa`       | `EXA_API_KEY`       | `contents`, `similar`                          | Page content retrieval and semantically similar URLs.                      |

## Provider choice cheatsheet

- Need native operators like `filetype:pdf`, `intitle:`, or `before:`?
  Start with `brave` or `kagi`.
- Need API-level domain/date/country filtering? Use `tavily`.
- Need semantic discovery, similar pages, or meaning-based results?
  Use `exa`.
- Need source-grounded narrative answers? Use `ai_search` with
  `kagi_fastgpt`, `exa_answer`, or `linkup`.
- Need to crawl/scrape/map a site? Use `web_extract` with `firecrawl`.
- Need public code/repository/user discovery? Use `github_search`.
