---
'mcp-omnisearch': minor
---

Replace the consolidated MCP interface with Code Mode, powered by Pi's
local QuickJS sandbox and schema-generated native provider functions.

**Breaking API change:** `search` and `execute` replace `web_search`,
`ai_search`, `web_extract` and `github_search`. Clients must discover
native functions and call them from JavaScript passed to `execute`.
Arguments and responses now use provider-native formats rather than
shared normalized contracts. Provider credential names and the stdio
command remain unchanged. Node.js 22.19 or newer is required.

Expose 22 functions across the seven existing providers, with
host-side request validation and credential isolation. Remove legacy
adapters, operator translation, automatic retries and polling, and the
old provider-info resource templates. Offloaded results now contain
the complete execution envelope as JSON.

Compact schema discovery and allow scripts to compose API calls and
filter intermediate results before returning data. Native responses
pass through unchanged, including nullable metadata such as favicons.

See
[the migration guide](https://github.com/spences10/mcp-omnisearch/blob/main/docs/migration.md)
for client updates and
[Code Mode documentation](https://github.com/spences10/mcp-omnisearch/blob/main/docs/codemode.md)
for function discovery, execution limits and benchmark findings.
