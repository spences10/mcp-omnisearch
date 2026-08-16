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

## Auto-routing

When `provider` is omitted or set to `auto` on `web_search`,
`ai_search`, or `web_extract`, Omnisearch scores **configured**
providers from query (or URL) signals and picks **exactly one**
winner. This is not multi-provider fan-out.

An explicit `provider` value such as `tavily` always wins.

If no configured provider is eligible — for example `web_extract` with
`mode: "crawl"` when only Tavily is configured — the tool fails
visibly instead of inventing results.

### Signals

| Signal                | Examples                        | Prefers             |
| --------------------- | ------------------------------- | ------------------- |
| Operators             | `site:`, `filetype:`, `before:` | Brave, Kagi, Tavily |
| Freshness / news      | `today`, `latest news`          | Tavily, Brave       |
| Docs / code           | `documentation`, `how to`       | Brave, Kagi, Tavily |
| Semantic / academic   | `similar`, `arxiv`, papers      | Exa                 |
| Specialized indexes   | `enrichment`, non-mainstream    | Kagi Enrichment     |
| Deep AI questions     | `deep`, `comprehensive`         | Linkup              |
| Semantic AI questions | `similar`, meaning              | Exa Answer          |
| Default AI answers    | generic questions               | Kagi FastGPT        |
| Video / podcast URLs  | YouTube, Vimeo                  | Kagi                |
| Documentation URLs    | `docs.*`, `/docs`               | Firecrawl           |
| Generic extraction    | other URLs                      | Tavily              |

### Tie-break priority

Equal scores use this documented order:

- `web_search`: tavily > brave > kagi > exa > kagi_enrichment
- `ai_search`: kagi_fastgpt > exa_answer > linkup
- `web_extract`: tavily > firecrawl > kagi > exa

The last routing decision (winner, reason, and scores) is available
from `get_last_routing_decision()` for opt-in diagnostics. Default
tool payloads stay unchanged.

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
