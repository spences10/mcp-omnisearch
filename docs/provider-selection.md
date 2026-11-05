# Provider selection

Only providers with configured API keys appear in `search` results.
Use a provider-scoped lookup such as `{"query":"tavily"}` to retrieve
function names and compact declarations together, then call those
functions inside `execute`.

| Provider  | API key             | Native functions and uses                                                                                                                                           |
| --------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tavily    | `TAVILY_API_KEY`    | `tavily_search` for web search; `tavily_extract`, `tavily_crawl`, `tavily_map` for content; `tavily_research` and `tavily_research_status` for asynchronous reports |
| Exa       | `EXA_API_KEY`       | `exa_search` for semantic discovery, `exa_answer` for answers, `exa_contents` for content, `exa_similar` for similar pages                                          |
| Brave     | `BRAVE_API_KEY`     | `brave_search` with native query syntax; request subset is `q` and `count`                                                                                          |
| Kagi      | `KAGI_API_KEY`      | `kagi_search` with native query syntax; request subset is `query` and `limit`; requires an API v1 key                                                               |
| GitHub    | `GITHUB_API_KEY`    | `github_search_code`, `github_search_repositories`, `github_search_users`, using GitHub qualifiers in `q`                                                           |
| Linkup    | `LINKUP_API_KEY`    | `linkup_search` with native `depth` and `outputType`, including sourced answers                                                                                     |
| Firecrawl | `FIRECRAWL_API_KEY` | `firecrawl_scrape`, `firecrawl_crawl`, `firecrawl_map`, `firecrawl_extract`, plus crawl/extract status functions                                                    |

Firecrawl browser actions are an argument to `firecrawl_scrape`, not a
separate function. `FIRECRAWL_BASE_URL` continues to support
self-hosted v2 instances; see
[deployment](deployment.md#self-hosted-firecrawl).

There is no cross-provider input or output normalization. Tavily uses
`max_results` and `include_domains`; Exa uses `numResults` and
`includeDomains`. Inspect the declarations for supported parameters
and limits rather than reusing one provider's arguments for another.

Asynchronous jobs return their native identifiers. Use the respective
status function later; the server does not automatically poll or
retry.

## Example: GitHub code search

Discover `github_search_code`, then execute:

```js
const response = await tools.github_search_code({
	q: 'repo:sveltejs/kit filename:remote.ts',
	per_page: 5,
});
return response.items.map(({ html_url, path }) => ({
	html_url,
	path,
}));
```

See [GitHub token setup](troubleshooting.md#github-token-setup) for
public search credentials and [search operators](search-operators.md)
for native syntax and explicit filters.
