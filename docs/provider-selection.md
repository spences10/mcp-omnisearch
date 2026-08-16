# Provider selection

MCP Omnisearch registers only providers with configured API keys. Use
the smallest provider that matches the job, then switch providers when
you need a different ranking style, operator model, or processing
mode.

## Search providers

| Provider          | API key          | Best for                                                              | Operators and filters                                                                                                               |
| ----------------- | ---------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `brave`           | `BRAVE_API_KEY`  | Privacy-oriented web search, native search operators, exact discovery | Passes rich operators through in the query string and merges `include_domains` / `exclude_domains` into `site:` / `-site:` clauses. |
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

## Partial success

`web_search` and `ai_search` accept either one `provider` string or a
list. A single string keeps the existing result array and still fails
the whole tool when that provider errors.

A list runs the selected providers concurrently and always returns
whatever succeeded, plus metadata:

- `selected` — providers that were invoked
- `successful` — providers that returned results
- `failed` — `{ provider, type }` only; no exception text or secrets
- `timed_out` — providers that hit `TIMEOUT` / abort
- `preempted` — optional cooldown / skip list when a caller supplies
  one

Empty successful lists are valid. Use this to debug “why did only
Firecrawl come back?” without leaking raw provider errors.

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
