# Code Mode

Code Mode is an opt-in native API interface powered by
[`@earendil-works/pi-codemode`](https://github.com/earendil-works/pi/tree/main/packages/codemode).
It uses a local QuickJS WebAssembly sandbox, not a Pi agent session or
an additional LLM. Node.js 22.19 or newer is required.

The server exposes two MCP tools:

- `search`: discover configured provider functions and their generated
  TypeScript declarations.
- `execute`: run JavaScript that calls those functions, combines their
  results, and returns only the data needed by the client.

The original four consolidated tools remain the default so the two
interfaces can be compared locally. The native path does not call the
legacy provider adapters. Removing those adapters is deferred until
native API behavior has been evaluated.

## Run locally

```bash
pnpm install
pnpm build
OMNISEARCH_TOOL_MODE=codemode node ./dist/index.js
```

Provider credentials must already be available to the server process.
The server does not automatically load `.env`. Use your existing
credential loader or MCP client's environment configuration.

For a development MCP entry, retain your existing provider credential
configuration and add the mode setting:

```json
{
	"mcpServers": {
		"mcp-omnisearch-dev": {
			"command": "node",
			"args": ["/absolute/path/to/mcp-omnisearch/dist/index.js"],
			"env": {
				"OMNISEARCH_TOOL_MODE": "codemode"
			}
		}
	}
}
```

Restart or reload that MCP connection after building. Only `search`
and `execute` should appear. Remove `OMNISEARCH_TOOL_MODE` to return
to the consolidated interface. Provider keys and `FIRECRAWL_BASE_URL`
work as before.

## Discover and execute

Call `search` with `{}` to list available function names. Only
providers with configured keys are included. To retrieve a function's
generated declaration:

```json
{ "query": "tavily_search" }
```

Declarations omit long schema descriptions and repeated function
prose. They retain field names, required/optional types, enums and
numeric constraints. Full request schemas still validate calls on the
host.

Then call `execute`:

```json
{
	"code": "const r = await tools.tavily_search({ query: 'MCP code mode', max_results: 3 }); return r.results.map(({ title, url }) => ({ title, url }));"
}
```

The `code` string is an async function body, not a function
definition. Top-level `await`, `return`, `text()` and `console.log()`
work.

An execution returns Pi's result envelope: `ok`, `value`, `output`,
`calls`, and either `storeWrites` or an `error`. An uncaught script or
provider failure also sets the MCP result's `isError` flag. Scripts
can catch individual provider failures and return partial results.
Calls completed before a failure are not undone.

Multiple independent requests can run in parallel:

```js
const responses = await Promise.all([
	tools.tavily_search({ query: 'MCP code mode', max_results: 3 }),
	tools.exa_search({ query: 'MCP code mode', numResults: 3 }),
]);
return responses.flatMap((response) =>
	response.results.map(({ title, url }) => ({ title, url })),
);
```

### Native arguments and responses

These are **provider-native APIs**, not the consolidated tool
contracts. For example, Tavily uses `max_results`, Exa uses
`numResults`, and GitHub uses `q` and `per_page`. Responses are not
normalized into Omnisearch search results. Search operators are not
translated. Inspect the generated declarations before calling.

Functions cover the existing providers and operations:

| Provider  | Functions exposed as `tools.<name>`                                                                                               |
| --------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Tavily    | `tavily_search`, `tavily_extract`, `tavily_crawl`, `tavily_map`, `tavily_research`, `tavily_research_status`                      |
| Exa       | `exa_search`, `exa_answer`, `exa_contents`, `exa_similar`                                                                         |
| Firecrawl | `firecrawl_scrape`, `firecrawl_crawl`, `firecrawl_crawl_status`, `firecrawl_map`, `firecrawl_extract`, `firecrawl_extract_status` |
| GitHub    | `github_search_code`, `github_search_repositories`, `github_search_users`                                                         |
| Brave     | `brave_search`                                                                                                                    |
| Kagi      | `kagi_search`                                                                                                                     |
| Linkup    | `linkup_search`                                                                                                                   |

Firecrawl browser actions are available through the native `actions`
argument of `firecrawl_scrape`.

Asynchronous operations return their native job identifiers. Use the
corresponding status function in a later execution. The sandbox has no
timers; it does not automatically poll or retry requests. Streaming
responses are not supported; omit `stream` or set it to `false`.

`omnisearch://providers/status` lists native provider availability and
the configured function names in Code Mode. The legacy provider info
resource templates are only available in consolidated mode.

## Schema generation

`src/codemode/provider-schemas.json` is the checked-in request-schema
snapshot. Runtime functions, argument validation and TypeScript
declarations all derive from it. Ordinary builds and server startup do
not fetch schemas from the network.

To refresh the snapshot intentionally:

```bash
pnpm generate:schemas
pnpm check
pnpm test
pnpm build
```

Review the resulting diff before using changed schemas. The snapshot
records source URLs and SHA-256 hashes of the parsed upstream specs.
The generator selects only explicitly allowlisted operations from
Tavily, Exa, Firecrawl, GitHub and Linkup's OpenAPI documents. It
keeps request constraints and reachable local references, and excludes
response schemas and documentation examples.

Brave and Kagi use small documented request schemas in
`tools/provider-schema-sources.ts`, rather than an unverified OpenAPI
source. Their supported parameter subsets are `q`/`count` and
`query`/`limit`, respectively. They use the same runtime generator as
all other providers.

## Benchmark findings

Local comparison on 2026-11-05 used the configured published server
and the development Code Mode server. The main benefit was smaller
workflow responses, not faster provider requests.

### Method

- Query: `Model Context Protocol specification architecture overview`.
- Search: three results; Tavily `basic`/`general`, with automatic
  parameters and raw content disabled; Exa `auto`, with up to 3,000
  text characters per result.
- One paired search warmup and three measured pairs per provider.
- Three paired Tavily search/extract workflows, alternating which
  server ran first. Extract the first search result as basic Markdown
  and return its URL, first 500 characters and full character count.
- Each simulated first task fetches the Code Mode catalog, then the
  two required declarations concurrently, then executes the workflow.
  Published tools need two calls: search and extract.
- Timing is client-observed wall time through Pi. Payload sizes are
  UTF-8 bytes of serialized MCP `CallToolResult` responses, excluding
  requests, transport framing and fixed tool descriptions.

All 28 provider API operations succeeded. Every paired search returned
identical ranked URLs, and all three workflow pairs produced identical
final projections.

### Discovery compaction

Discovery now omits long descriptions and repeated function prose,
while retaining types, enums, defaults and rendered constraints. The
full validation schemas remain unchanged.

| Schema lookup    | Original response bytes | Compact response bytes |
| ---------------- | ----------------------: | ---------------------: |
| `tavily_search`  |                  11,681 |                  4,967 |
| `tavily_extract` |                   2,662 |                    776 |
| `exa_search`     |                   6,845 |                  4,479 |

The catalog was unchanged at 1,564 bytes. For the Tavily workflow,
catalog plus schema discovery fell from 15,907 to 7,307 bytes.

### First-task and repeat-task results

| Metric                                                 | Published | Compact Code Mode |
| ------------------------------------------------------ | --------: | ----------------: |
| First-task response bytes, including discovery         |    11,370 |             8,253 |
| Median first-task time                                 |    374 ms |            476 ms |
| First-task MCP calls                                   |         2 |                 4 |
| Provider API calls per workflow                        |         2 |                 2 |
| Repeat-task response bytes, with schemas already known |    11,370 |               946 |
| Repeat-task MCP calls                                  |         2 |                 1 |

Compacted first-task responses were **27.4% smaller than published**.
The original Code Mode first-task payload, reconstructed from the
previously measured catalog, declarations and execution response, was
16,854 bytes. Compaction reduced that total by **51.0%**. This
original total was reconstructed, not timed as a complete historical
first task.

With schemas already known, the selected workflow returned **91.7%
less response data**. Median discovery time was 44 ms; an empty Code
Mode execution took 56 ms. Plain warm-search median times were 151/214
ms for published/Code Mode Tavily and 265/289 ms for Exa.

### Interpretation and limitations

This is a small, repeated-query sample, not a statistically conclusive
speed comparison. First task means empty schema knowledge, not a cold
server or provider cache. Upstream caches were not controlled, and LLM
planning or code-generation time was not measured. The exact published
package version and network request traces were not captured.

Pi can also filter published tool responses client-side, so smaller
MCP payloads do not automatically imply equivalent LLM-context or
token savings. Only Tavily and Exa searches and Tavily extraction were
tested; these results do not establish parity for every provider or
operation. The legacy path remains available for further comparison.

The four-call first-task strategy is not mandatory. A provider-scoped
lookup such as `search({"query":"tavily"})` already returns matching
function names and declarations together. Followed by `execute`, that
can reduce the workflow to two MCP calls, but returns schemas for all
Tavily functions. That alternative was not benchmarked in this run.

## Execution boundary and limits

- Credentials and authenticated HTTP requests stay in the host.
  JavaScript receives neither credentials nor arbitrary `fetch`.
- Provider origins, methods, paths and authentication headers are
  host-controlled. API specs cannot choose authentication or origins.
  Redirects are rejected.
- Native arguments are validated against their JSON Schemas before any
  HTTP request. Format annotations are not validated locally;
  providers validate formats such as dates and URLs.
- No Node APIs, filesystem, modules, networking or timers are exposed
  to scripts. Scripts can only call the injected provider functions.
- Each execution has a 64 MiB QuickJS heap and a default deadline of
  60 seconds. `timeout_ms` can select up to 180 seconds. Host request
  timeouts also apply, and cancellation aborts pending requests.
- At most 20 provider calls are allowed per execution, and two worker
  threads may run at once across the process. A busy response can be
  retried after an execution finishes.
- Provider requests can incur charges or perform browser actions. The
  outer `execute` tool is conservatively marked non-idempotent and
  potentially destructive. There are no per-operation approval prompts
  inside a script.
- State is not persisted between executions. `storeWrites` is reported
  by Pi but is not applied by this server.
- Final results use the existing
  [large-result behavior](large-results.md). Set `large_result_mode`
  to `inline` where the client cannot read server-side files. Filter
  intermediate data before returning it to avoid oversized output.
