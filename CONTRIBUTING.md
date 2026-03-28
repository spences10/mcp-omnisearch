# Contributing

Thanks for your interest in contributing to mcp-omnisearch. The goal
of this project is to provide a clear, reliable set of MCP tools with
code that’s easy to reason about and safe to extend.

## Core Principles

- Small, focused PRs: Prefer a narrow, self‑contained change over a
  broad refactor. One good PR with a clear explanation is far more
  likely to be reviewed and merged quickly than many large PRs opened
  at once.
- Explain the “why”: In your PR description, include the problem, the
  approach, and how you verified it. Short screen recordings or gifs
  are very welcome.
- Build trust incrementally: Start with a small change; once merged,
  follow up with the next logical step. Avoid submitting several big
  PRs simultaneously.

## PR Expectations (What To Include)

- Summary: 1–3 sentences describing the change and motivation.
- Scope: What files/areas are touched and why they’re needed (no
  drive‑by changes).
- Verification: How you tested locally (commands and expected
  outputs). If applicable, example MCP tool calls and sample results.
- Impact: Any breaking changes, provider/API key requirements, or
  behavior differences.

## Project Conventions (Please Follow)

- **HTTP and errors**
  - Use the shared helper `src/common/http.ts` (`http_json`) for all
    network requests. Do not introduce new raw `fetch` usage in
    providers.
  - Map status codes to `ProviderError` consistently; let `http_json`
    handle common cases (401/403/429/5xx).
  - Always include request timeouts using `AbortSignal.timeout(...)`
    with values from `src/config/env.ts`.
- **Auth and configuration**
  - Read API keys from `src/config/env.ts` and validate with
    `validate_api_key(...)`.
  - Do not hard‑code keys or base URLs; use the `config` object seen
    in the codebase.
  - Providers must remain opt‑in: if a key is missing, the provider’s
    tools must not be registered (see `initialize_providers()`).
- **Retries**
  - Use `retry_with_backoff(...)` for provider calls that can
    transiently fail (rate limits, flaky networks).
- **Formatting & style**
  - This repo uses Prettier. Run `pnpm run format` (or
    `pnpm run format:check`) before submitting.
  - TypeScript, ESM modules, no new lint rules or formatters.
- **Scope discipline**
  - Keep unrelated changes out of your PR. If you spot issues, open a
    separate issue or a follow‑up PR.

## Provider Authoring Guide (Short)

- Use `http_json` for requests and JSON parsing.
- Use the appropriate auth header per provider (e.g.,
  `Authorization: Bearer`, `Authorization: Bot`, or vendor‑specific
  tokens). Several existing providers are good references.
- Timeouts come from `config`; do not hard‑code.
- Return the minimal, structured shape expected by our common types
  (search, processing).

## Local Dev Quickstart

- Install deps: `pnpm install`
- Build: `pnpm run build`
- Format: `pnpm run format` (or `pnpm run format:check`)
- Optional: run via MCP Inspector for basic tool listing and
  invocations: `npx @modelcontextprotocol/inspector dist/index.js`

## Submitting Changes

- Open an issue first proposing the change. Briefly describe the
  problem, the proposed solution, and any alternatives. This helps
  align scope before you write code.
- Open a small PR with a clear description (problem → approach →
  verification). If the change is part of a broader effort, note the
  plan and which step this PR covers.
- If your change spans multiple logical parts, stage them as a series
  of small PRs, each independently reviewable.
- Use concise changeset messages (1 line) when applicable.

## What Gets PRs Merged Faster

- A focused diff that’s easy to review.
- Clear rationale and validation steps in the PR description (bonus: a
  short video/gif).
- Adherence to project conventions (http_json, timeouts, config,
  ProviderError usage, formatting).

## Out Of Scope (Please Avoid)

- Adding startup banners, excessive logs, or unrelated observability
  changes.
- Introducing shared input schemas for tools that force providers into
  awkward shapes.
- Large, multi‑area refactors combined with feature changes in a
  single PR.

## Code of Conduct

- Be respectful and collaborative. Thoughtful discussion and small,
  well‑explained changes build trust and move the project forward
  quickly.
