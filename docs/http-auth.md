# HTTP bearer auth and rate limits

stdio remains the default transport and does not use these settings.

When `TRANSPORT=http`, Omnisearch serves Streamable HTTP MCP on
`HTTP_PATH` (default `/mcp`) and a liveness endpoint at `/health`.

## Fail closed

Non-loopback binds (`0.0.0.0`, `::`, or any routable address) refuse
to start unless `AUTH_TOKENS` contains at least one unique, nonblank
bearer token. Loopback binds (`127.0.0.1`, `::1`, `localhost`) may
start without tokens for local development.

Tokens must be unique and nonblank. JSON array values may not include
surrounding whitespace. Comma, semicolon, or newline lists trim
delimiter padding.

```bash
TRANSPORT=http
HOST=0.0.0.0
PORT=8080
AUTH_TOKENS=replace-me,another-token
```

Clients send `Authorization: Bearer <token>`.

## Rate limits

Authenticated MCP requests use a per-token sliding window. The default
is 120 requests per token per 60 seconds (`RATE_LIMIT_REQUESTS=120`,
`RATE_LIMIT_WINDOW_MINUTES=1`).

Unauthenticated MCP traffic shares one tight bucket
(`UNAUTH_RATE_LIMIT_REQUESTS=20` over the same window) and is rejected
with 401 when tokens are configured. Exceeding a window returns 429
with `Retry-After`.

`GET` and `HEAD` `/health` stay outside auth and rate limits so
orchestrators can probe the process.

## Example

```bash
TRANSPORT=http HOST=127.0.0.1 PORT=8080 node ./dist/index.js
curl -s http://127.0.0.1:8080/health
# {"status":"ok"}
```
