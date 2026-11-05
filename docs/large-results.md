# Large results

Filter intermediate provider data inside `execute` before returning.
Only the final execution envelope is sent back to the MCP client or
offloaded; provider responses are not automatically normalized or
copied into combined extraction fields.

```js
const response = await tools.tavily_extract({
	urls: ['https://example.com/article'],
});
return response.results.map(({ url, raw_content }) => ({
	url,
	preview: raw_content.slice(0, 500),
}));
```

## Controls

`execute` accepts `large_result_mode: "file"` or `"inline"` alongside
`code`. The request setting overrides `OMNISEARCH_LARGE_RESULT_MODE`.
The default is `file`.

| Mode     | Behavior                                                                                                                                                                     | Use when                                                                            |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `file`   | Writes final envelopes larger than approximately 80,000 serialized characters to a server-side temp file and returns a path, line count, estimated token count and read hint | The MCP client and server share a filesystem, such as local stdio usage             |
| `inline` | Returns the full execution envelope through MCP                                                                                                                              | The client has its own indexing/offload layer, or cannot read the server filesystem |

Offloaded files contain JSON, including `ok`, `value`, `output` and
`calls`, plus success store writes or the failure error. Read them as
JSON or in line ranges using the returned hint. They do not contain
legacy extraction section lists or combined-content metadata.

## Remote and container caveat

Server-side temp-file paths are only useful when the MCP client can
read the server filesystem. Prefer `inline` for hosted, containerized
or otherwise remote MCP deployments.

When `OMNISEARCH_LARGE_RESULT_MODE=file` is used in common remote or
container environments, the server logs a startup warning. This
repository's transport remains stdio; using `inline` does not add an
HTTP transport.

The sandbox still has its own output and memory limits. Large-result
offload does not avoid those limits or reduce provider work already
performed. Return selected fields rather than entire API responses
when possible.
