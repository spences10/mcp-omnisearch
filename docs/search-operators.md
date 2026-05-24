# Search operators

Operator behavior is provider-specific. Brave and Kagi preserve rich
query syntax most directly, Tavily translates a supported subset into
API parameters, Exa focuses on semantic search plus domain filters,
and GitHub uses GitHub search qualifiers.

## Operator matrix

| Feature                               | Brave                                   | Kagi                                   | Tavily                                         | Exa                              | GitHub                                  |
| ------------------------------------- | --------------------------------------- | -------------------------------------- | ---------------------------------------------- | -------------------------------- | --------------------------------------- |
| `site:example.com`                    | Native query passthrough                | Query passthrough                      | `include_domains`                              | Domain parameter                 | Use `repo:` / `user:` where relevant    |
| `-site:example.com`                   | Native query passthrough                | Query passthrough                      | `exclude_domains`                              | Domain parameter where supported | Not applicable                          |
| `include_domains` / `exclude_domains` | Merged into query as `site:` / `-site:` | Merged/preserved as provider filtering | Native request fields                          | Native request fields            | Not applicable                          |
| `filetype:pdf` / `ext:pdf`            | Native query passthrough                | Kagi `file_type` parameter             | Left in sanitized query only where unsupported | Not a primary operator           | Not applicable                          |
| `intitle:`                            | Native query passthrough                | Query passthrough                      | Left in sanitized query                        | Not a primary operator           | Not applicable                          |
| `inurl:`                              | Native query passthrough                | Query passthrough                      | Left in sanitized query                        | Not a primary operator           | Not applicable                          |
| `inbody:` / `inpage:`                 | Native query passthrough                | Query passthrough                      | Left in sanitized query                        | Not a primary operator           | Not applicable                          |
| `lang:en`                             | Native query passthrough                | Query passthrough                      | Left in sanitized query                        | Not a primary operator           | `language:typescript` for GitHub        |
| `loc:us` / `location:us`              | Native query passthrough                | Query passthrough                      | `country` parameter                            | Not a primary operator           | Not applicable                          |
| `before:` / `after:`                  | Native query passthrough                | Kagi `time_range` parameter            | `end_date` / `start_date`                      | Not a primary operator           | GitHub supports its own date qualifiers |
| `"exact phrase"`                      | Native query passthrough                | Query passthrough                      | Enables `exact_match`                          | Semantic matching                | Quote strings in GitHub query           |
| `+required` / `-excluded`             | Native query passthrough                | Query passthrough                      | Left in sanitized query where unsupported      | Not a primary operator           | GitHub query syntax                     |
| `AND` / `OR` / `NOT`                  | Native query passthrough                | Query passthrough                      | Left in sanitized query where unsupported      | Not a primary operator           | GitHub query syntax varies by endpoint  |
| `filename:` / `path:` / `repo:`       | Not primary                             | Not primary                            | Not primary                                    | Not primary                      | Native GitHub qualifiers                |

Unsupported provider-specific operators remain in the sanitized query
where possible rather than being flattened globally.

## Tested examples

### Brave: native operator passthrough

```json
{
	"query": "sveltekit in:title site:kit.svelte.dev -site:spam.dev filetype:pdf intitle:guide inurl:docs inbody:load inpage:actions lang:en loc:us before:2024 after:2023 \"remote functions\" +forms -legacy",
	"provider": "brave",
	"limit": 7,
	"include_domains": ["docs.example.com"],
	"exclude_domains": ["ads.example.com"]
}
```

Brave receives a query with explicit domain arrays merged into `site:`
and `-site:` clauses.

### Kagi: parameters for file type and dates

```json
{
	"query": "sveltekit in:title site:kit.svelte.dev filetype:pdf intitle:guide before:2024 after:2023 \"remote functions\"",
	"provider": "kagi",
	"limit": 4
}
```

Kagi receives `file_type=pdf`, `time_range=after:2023,before:2024`,
and a cleaned query preserving other supported operators.

### Tavily: translated operators

```json
{
	"query": "sveltekit in:title site:kit.svelte.dev -site:spam.dev before:2024 after:2023 loc:US \"remote functions\"",
	"provider": "tavily",
	"limit": 3,
	"include_domains": ["docs.example.com"],
	"exclude_domains": ["ads.example.com"]
}
```

Tavily receives merged domain arrays, `start_date`, `end_date`,
`country`, and `exact_match` fields.

### GitHub search qualifiers

```json
{
	"query": "filename:remote.ts path:src repo:sveltejs/kit language:typescript in:file \"export function\"",
	"search_type": "code",
	"limit": 5
}
```

GitHub supports code, repository, and user search. Common qualifiers
include `filename:`, `path:`, `repo:`, `user:`, `language:`, and
`in:file`.
