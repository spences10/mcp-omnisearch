# Migrating to Code Mode only

This is a **breaking tool API change**, not a backwards-compatible
patch upgrade. The server now exposes only `search` and `execute`. The
legacy provider adapters and consolidated tools have been removed.

## Client configuration

- Keep the same server command and provider API key variables.
- Use Node.js 22.19 or newer.
- Rebuild from source or install the Code Mode-only release, then
  restart or reload the MCP connection so cached tool lists refresh.
- Update client instructions, skills and automation that name the old
  tools. Pin the previous published version until those consumers have
  migrated if compatibility is required.

The new `search` tool discovers API functions; it does not perform a
web search itself. Existing web-search calls must move into `execute`.

## Tool calls

First discover a function with `search`, then invoke it inside
JavaScript passed to `execute`:

```json
{ "query": "tavily_search" }
```

```json
{
	"code": "const r = await tools.tavily_search({ query: 'MCP code mode', max_results: 3 }); return r.results.map(({ title, url }) => ({ title, url }));"
}
```

A provider-scoped lookup such as `{"query":"tavily"}` returns function
names and declarations together. It avoids a separate catalog call,
but includes schemas for every matching function.

| Removed MCP tool | Native functions called inside `execute`                                                                       |
| ---------------- | -------------------------------------------------------------------------------------------------------------- |
| `web_search`     | `tavily_search`, `brave_search`, `kagi_search`, `exa_search`                                                   |
| `ai_search`      | `exa_answer`, `linkup_search`, `tavily_research`, `tavily_research_status`                                     |
| `web_extract`    | `tavily_extract`, `tavily_crawl`, `tavily_map`, `exa_contents`, `exa_similar`, and the `firecrawl_*` functions |
| `github_search`  | `github_search_code`, `github_search_repositories`, `github_search_users`                                      |

Arguments are provider-native. For example:

| Old argument                                        | Native replacement                               |
| --------------------------------------------------- | ------------------------------------------------ |
| Tavily search `limit`                               | `max_results`                                    |
| Exa search `limit`                                  | `numResults`                                     |
| Brave search `query` / `limit`                      | `q` / `count`                                    |
| GitHub search `query` / `limit`                     | `q` / `per_page`                                 |
| Tavily extraction `url`                             | `urls`                                           |
| `provider`, extraction `mode`, GitHub `search_type` | Select the corresponding native function instead |

Use generated declarations rather than passing consolidated arguments
through unchanged. Provider-specific options, enum values and limits
are validated against the checked-in native request schemas.

## Results and behavior

- `execute` returns Pi's envelope with `ok`, `value`, `output` and
  `calls`, plus `storeWrites` on success or `error` on failure. The
  native API result is in `value` when returned by the script.
- Results are no longer normalized into shared `title`/`snippet`/
  `source_provider` or combined extraction contracts. Map native
  fields in the script when a client needs a consistent shape.
- Search query operators are passed through unchanged. Domain, date
  and country filters are no longer inferred or translated; use the
  provider's native fields explicitly.
- There are no automatic retries or job-polling loops. Retrieve
  asynchronous job status through the corresponding status function in
  a later execution. Avoid blindly retrying paid or side-effecting
  operations.
- Streaming is unsupported. Omit `stream` or set it to `false`.
- Uncaught script/provider errors set MCP `isError`. Scripts may catch
  individual provider errors for partial results, but completed API
  calls are not rolled back.
- `omnisearch://providers/status` now returns a list of provider
  names, availability and configured native function names. The old
  grouped status shape and provider-info resource templates are
  removed.
- `OMNISEARCH_LARGE_RESULT_MODE` and per-execution `large_result_mode`
  still work. Offloaded files contain the full execution envelope as
  JSON; old extraction section lists and metadata hints are removed.

See [Code Mode](codemode.md) for the complete function list, sandbox
limits and benchmark findings, and
[provider selection](provider-selection.md) for provider-specific
guidance.
