# Large results

Large search and extraction responses can exceed MCP client or
transport limits. MCP Omnisearch supports per-request and global
controls for oversized responses.

## Controls

Each eligible tool accepts:

```json
{
	"large_result_mode": "file"
}
```

or:

```json
{
	"large_result_mode": "inline"
}
```

The environment variable `OMNISEARCH_LARGE_RESULT_MODE` sets the
default. Request-level `large_result_mode` overrides it.

## Modes

| Mode     | Behavior                                                                                                                                | Use when                                                                                                                 |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `file`   | Writes oversized responses to a server-side temp file and returns a path, section list, line count, and read hint. This is the default. | The MCP client and server share a filesystem, such as local stdio usage.                                                 |
| `inline` | Returns the full response through MCP.                                                                                                  | The client has its own indexing/offload layer, or the server runs remotely, in HTTP, in a container, or on another host. |

## Remote and container caveat

Server-side temp-file paths are only useful when the MCP client can
read the server filesystem. Prefer `inline` for HTTP, hosted,
containerized, or otherwise remote MCP deployments.

When `OMNISEARCH_LARGE_RESULT_MODE=file` is used in common remote or
container environments, the server logs a startup warning. A future
breaking release may rename this mode to `local_file`; keep using
`inline` anywhere the MCP client and server do not share a filesystem.

## Avoid duplicate extraction payloads

For `web_extract`, set `include_raw_contents: false` when you only
need the combined `content` field:

```json
{
	"url": [
		"https://example.com/article1",
		"https://example.com/article2"
	],
	"provider": "tavily",
	"include_raw_contents": false
}
```

This avoids duplicating huge per-URL text in both `content` and
`raw_contents`.
