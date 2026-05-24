# Troubleshooting

## API keys and access

Each provider requires its own key:

- Tavily: `TAVILY_API_KEY`
- Kagi: `KAGI_API_KEY`; some features may require a Business/Team plan
- Brave: `BRAVE_API_KEY`
- GitHub: `GITHUB_API_KEY`; use a public-access token with no scopes
- Exa: `EXA_API_KEY`
- Linkup: `LINKUP_API_KEY`
- Firecrawl: `FIRECRAWL_API_KEY`

Missing keys do not stop the server. The matching provider is skipped
and configured providers remain available.

## Common failure modes

| Symptom                                   | Likely cause                                              | Fix                                                                                                                              |
| ----------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Provider is unavailable                   | Missing API key                                           | Set the provider key and restart the MCP server. Check `omnisearch://providers/status`.                                          |
| Request fails with unauthorized/forbidden | Invalid key or plan mismatch                              | Verify the key belongs to the provider and has access to the endpoint or plan tier.                                              |
| Query rejected before provider call       | Invalid input                                             | Check for empty queries, unsupported modes, malformed domains, or unsupported URL protocols.                                     |
| Repeated transient errors                 | Rate limits, timeout, network failure, or provider 5xx    | Retry later or lower request volume. Retryable failures are handled separately from invalid credentials and validation failures. |
| Returned file path cannot be read         | Server wrote a temp file on a remote/container filesystem | Retry with `large_result_mode: "inline"` or set `OMNISEARCH_LARGE_RESULT_MODE=inline`.                                           |

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

Each provider has its own limits. MCP Omnisearch formats provider
rate-limit errors and retries only retryable classes such as 429,
timeouts, network failures, and 5xx responses. Invalid credentials and
validation failures are not retried.

## Large result paths

If a tool response points to a temp file, that file exists on the MCP
server host. Local stdio clients can usually read it. Remote HTTP
clients, hosted clients, and containers usually cannot. Use `inline`
mode in those deployments. See [large results](large-results.md).
