# mcp-omnisearch Development Instructions

**Always reference these instructions first and fallback to search or
bash commands only when you encounter unexpected information that does
not match the info here.**

## Working Effectively

### Prerequisites and Setup

- Install Node.js >=22.0.0
- Install pnpm globally: `npm install -g pnpm` (takes ~2 seconds)

### Development Commands

- **Format code**: `pnpm run format`
- **Build**: `pnpm run build`

## Validation Requirements

### ALWAYS run these before submitting changes:

1. `pnpm run format` - Auto-format all code
2. `pnpm run build` - Check for build issues

#### Add changeset once you're done

Run `pnpm changeset` then follow the prompts. Use this after having
finished the task. Most of the time this is a patch release for
`mcp-omnisearch`. Use a short and descriptive message. Always prefix
the message with either `fix`, `feat`, `breaking`, or `chore` (most
likely `fix` since you're mostly working on bugfixes).
