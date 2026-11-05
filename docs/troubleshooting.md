# Troubleshooting

## API keys and access

Each provider requires its own key:

- Tavily: `TAVILY_API_KEY`
- Kagi: `KAGI_API_KEY`; requires a Kagi API v1 key from
  <https://kagi.com/api/keys>, legacy v0 keys are not accepted
- Brave: `BRAVE_API_KEY`
- GitHub: `GITHUB_API_KEY`; use a public-access token with no scopes
- Exa: `EXA_API_KEY`
- Linkup: `LINKUP_API_KEY`
- Firecrawl: `FIRECRAWL_API_KEY`

Missing keys do not stop the server. The matching provider is skipped
and configured providers remain available.

## Common failure modes

| Symptom                               | Likely cause                                | Fix                                                                                              |
| ------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Old tools are missing                 | Code Mode-only upgrade                      | Use `search` and `execute`; update client instructions using the [migration guide](migration.md) |
| Provider function is unavailable      | Missing API key                             | Set the provider key and restart. Check `omnisearch://providers/status`                          |
| Unauthorized or forbidden request     | Invalid key or plan mismatch                | Verify the key and endpoint access                                                               |
| Arguments rejected before an API call | Native schema validation failed             | Discover the function and check required fields, names, types and enums                          |
| Transient or rate-limit failure       | Network error, timeout, provider 5xx or 429 | Reduce volume or retry an appropriate operation later; there are no automatic retries            |
| Returned file cannot be read          | Client and server do not share a filesystem | Use `large_result_mode: "inline"` on `execute` or `OMNISEARCH_LARGE_RESULT_MODE=inline`          |

## GitHub token setup

For GitHub search, create a personal access token with public
repository access only:

1. Open
   [GitHub personal access tokens](https://github.com/settings/tokens).
2. Select **Generate new token** then **Generate new token
   (classic)**.
3. Name it `MCP Omnisearch - Public Search`.
4. Choose an expiration.
5. Leave all scopes unchecked.
6. Generate the token and set it as `GITHUB_API_KEY`.

Security notes:

- No scopes means no private repository access.
- The token can access public code search, repository discovery, and
  user profiles.
- GitHub code search has stricter rate limits than general API
  requests.
- Revoke the token anytime from GitHub settings.

## Rate limits

Each provider has its own limits. MCP Omnisearch reports provider HTTP
failures but does not automatically retry any request. Scripts can
catch failures for partial results. Retry only when appropriate: paid
requests and browser actions may have already taken effect. Scripts
also have a maximum of 20 provider calls and a bounded execution
deadline; see [Code Mode](codemode.md#execution-boundary-and-limits).

## Large result paths

If a tool response points to a temp file, that file exists on the MCP
server host. Local stdio clients can usually read it. Remote HTTP
clients, hosted clients, and containers usually cannot. Use `inline`
mode in those deployments. See [large results](large-results.md).
