# Search operators and native filters

Code Mode does not parse, sanitize or translate search operators.
Queries are sent to the provider unchanged. Whether an operator is
supported is up to that provider; Omnisearch no longer merges domain
arrays into query strings or infers dates and countries from text.

Use native query syntax for Brave, Kagi and GitHub, and explicit
provider fields for filters where the generated schema supports them.
The examples below are JavaScript bodies for `execute`; discover the
functions with `search` first.

## Brave and Kagi

```js
return await tools.brave_search({
	q: 'site:example.com filetype:pdf guide',
	count: 5,
});
```

```js
return await tools.kagi_search({
	query: 'site:example.com guide',
	limit: 5,
});
```

These functions expose only their documented request subsets. There
are no separate `include_domains` or `exclude_domains` arguments for
Brave or Kagi.

## Tavily: explicit fields

```js
return await tools.tavily_search({
	query: 'remote functions',
	max_results: 3,
	include_domains: ['svelte.dev'],
	exclude_domains: ['example.com'],
	start_date: '2026-01-01',
	end_date: '2026-12-31',
	country: 'united states',
	exact_match: true,
});
```

`site:`, `before:`, `after:` and `loc:` text is not converted into
these parameters. Supply the native fields explicitly.

## Exa: native domain filters

```js
return await tools.exa_search({
	query: 'Svelte remote functions',
	numResults: 3,
	includeDomains: ['svelte.dev'],
});
```

## GitHub: qualifiers in `q`

```js
return await tools.github_search_code({
	q: 'repo:sveltejs/kit path:src language:typescript',
	per_page: 5,
});
```

GitHub code, repository and user search are separate functions. No
`search_type` argument is needed.
