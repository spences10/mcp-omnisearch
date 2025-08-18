# Testing Guide for MCP Omnisearch

This document provides comprehensive information about testing the MCP Omnisearch project.

## Table of Contents

- [Overview](#overview)
- [Test Structure](#test-structure)
- [Running Tests](#running-tests)
- [Test Categories](#test-categories)
- [Writing Tests](#writing-tests)
- [Testing with API Keys](#testing-with-api-keys)
- [Continuous Integration](#continuous-integration)
- [Troubleshooting](#troubleshooting)

## Overview

MCP Omnisearch uses [Vitest](https://vitest.dev/) as the testing framework, providing:

- **Fast execution** with native TypeScript support
- **Comprehensive coverage** reporting
- **Mock and spy capabilities** for testing external dependencies
- **Integration testing** with real API providers
- **Interactive UI** for test development

## Test Structure

```
src/__tests__/
├── fixtures/           # Mock data and test fixtures
│   └── mock-responses.ts
├── integration/        # Integration tests with real APIs
│   └── api-providers.test.ts
└── unit/              # Unit tests for individual components
    ├── utils.test.ts
    ├── types.test.ts
    ├── error-handling.test.ts
    ├── server/
    │   └── tools.test.ts
    └── providers/
        ├── tavily.test.ts
        ├── brave.test.ts
        ├── perplexity.test.ts
        └── jina-reader.test.ts
```

## Running Tests

### Basic Commands

```bash
# Run all tests once
pnpm test

# Run tests in watch mode (re-runs on file changes)
pnpm test:watch

# Run tests with interactive UI
pnpm test:ui

# Run tests with coverage report
pnpm test:coverage
```

### Filtering Tests

```bash
# Run specific test file
pnpm test utils.test.ts

# Run tests matching pattern
pnpm test --grep "error handling"

# Run only unit tests
pnpm test unit/

# Run only integration tests
pnpm test integration/
```

### Coverage Reports

Coverage reports are generated in the `coverage/` directory and include:

- **HTML report**: Open `coverage/index.html` in your browser
- **JSON report**: Machine-readable coverage data
- **Text summary**: Console output during test runs

## Test Categories

### Unit Tests

Test individual functions and components in isolation:

- **Utility functions**: Input validation, data transformation, error handling
- **Provider classes**: Mock external API calls to test logic
- **Type definitions**: Ensure proper TypeScript interfaces
- **Server components**: MCP server setup and tool registration

Example unit test:
```typescript
describe('sanitize_query', () => {
  it('should trim whitespace and replace newlines', () => {
    const result = sanitize_query('  test\nquery\r\n  ');
    expect(result).toBe('test query');
  });
});
```

### Integration Tests

Test complete workflows with real API providers:

- **Search providers**: Tavily, Brave, Kagi
- **AI response**: Perplexity AI
- **Content processing**: Jina Reader, Firecrawl
- **Cross-provider consistency**: Ensure uniform result formats

**Note**: Integration tests require valid API keys and may incur costs.

### Error Handling Tests

Comprehensive testing of error scenarios:

- **HTTP status codes**: 400, 401, 403, 429, 500
- **Network failures**: Timeouts, connection errors
- **Malformed responses**: Invalid JSON, missing fields
- **Input validation**: Invalid URLs, empty queries
- **Retry logic**: Exponential backoff, max retry limits

## Writing Tests

### Test File Naming

- Unit tests: `*.test.ts` in `src/__tests__/unit/`
- Integration tests: `*.test.ts` in `src/__tests__/integration/`
- Test fixtures: `src/__tests__/fixtures/`

### Best Practices

1. **Descriptive test names**: Clearly describe what is being tested
2. **Arrange, Act, Assert**: Structure tests with clear setup, execution, and verification
3. **Mock external dependencies**: Use `vi.mock()` for API calls and external services
4. **Test edge cases**: Invalid inputs, error conditions, boundary values
5. **Async testing**: Properly handle promises and async operations

### Example Test Structure

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('ProviderClass', () => {
  let provider: ProviderClass;

  beforeEach(() => {
    provider = new ProviderClass();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('method_name', () => {
    it('should handle successful case', async () => {
      // Arrange
      const mockResponse = { success: true };
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      // Act
      const result = await provider.method_name('input');

      // Assert
      expect(result).toEqual(expectedOutput);
      expect(fetch).toHaveBeenCalledWith(expectedUrl, expectedOptions);
    });

    it('should handle error case', async () => {
      // Arrange
      vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'));

      // Act & Assert
      await expect(provider.method_name('input')).rejects.toThrow('Network error');
    });
  });
});
```

### Mocking Guidelines

#### Mock External APIs

```typescript
// Mock fetch globally
global.fetch = vi.fn();

// Mock specific responses
vi.mocked(fetch).mockResolvedValueOnce({
  ok: true,
  status: 200,
  json: async () => mockResponse,
} as Response);
```

#### Mock Configuration

```typescript
vi.mock('../../config/env.js', () => ({
  config: {
    search: {
      tavily: {
        api_key: 'test-api-key',
        base_url: 'https://api.tavily.com',
        timeout: 30000,
      },
    },
  },
}));
```

## Testing with API Keys

### Environment Variables

Set API keys for integration testing:

```bash
# Required for integration tests
export TAVILY_API_KEY="your-tavily-key"
export BRAVE_API_KEY="your-brave-key"
export KAGI_API_KEY="your-kagi-key"
export PERPLEXITY_API_KEY="your-perplexity-key"
export JINA_AI_API_KEY="your-jina-key"
export FIRECRAWL_API_KEY="your-firecrawl-key"
```

### Test Environment File

Create `.env.test` for local testing:

```bash
# .env.test
TAVILY_API_KEY=your-tavily-key
BRAVE_API_KEY=your-brave-key
KAGI_API_KEY=your-kagi-key
PERPLEXITY_API_KEY=your-perplexity-key
JINA_AI_API_KEY=your-jina-key
FIRECRAWL_API_KEY=your-firecrawl-key
```

### Conditional Test Execution

Integration tests automatically skip when API keys are missing:

```typescript
const hasApiKeys = {
  tavily: !!process.env.TAVILY_API_KEY,
  brave: !!process.env.BRAVE_API_KEY,
  // ...
};

const skipIfNoKeys = (provider: keyof typeof hasApiKeys) => {
  return hasApiKeys[provider] ? describe : describe.skip;
};

skipIfNoKeys('tavily')('Tavily Integration Tests', () => {
  // Tests only run if TAVILY_API_KEY is available
});
```

## Continuous Integration

### GitHub Actions

Example CI configuration:

```yaml
name: Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '18'
      - run: pnpm install
      - run: pnpm test
        env:
          # Only include API keys that are safe for CI
          TAVILY_API_KEY: ${{ secrets.TAVILY_API_KEY }}
      - run: pnpm test:coverage
      - uses: codecov/codecov-action@v3
        with:
          file: ./coverage/coverage-final.json
```

### Pre-commit Hooks

Add testing to pre-commit hooks:

```bash
# .git/hooks/pre-commit
#!/bin/sh
pnpm test:coverage
if [ $? -ne 0 ]; then
  echo "Tests failed. Commit aborted."
  exit 1
fi
```

## Troubleshooting

### Common Issues

#### Tests Timing Out

- Increase timeout in `vitest.config.ts`:
  ```typescript
  export default defineConfig({
    test: {
      testTimeout: 30000, // 30 seconds
    },
  });
  ```

#### Mock Issues

- Clear mocks between tests:
  ```typescript
  beforeEach(() => {
    vi.clearAllMocks();
  });
  ```

- Restore mocks after tests:
  ```typescript
  afterEach(() => {
    vi.restoreAllMocks();
  });
  ```

#### API Rate Limits

- Use different API keys for testing
- Implement delays between integration tests
- Mock API responses for frequent test runs

#### TypeScript Errors

- Ensure test files import from correct paths
- Use proper type assertions for mocked functions:
  ```typescript
  const mockFetch = vi.mocked(fetch);
  ```

### Debug Mode

Run tests with debug output:

```bash
# Enable debug logging
DEBUG=* pnpm test

# Run specific test with verbose output
pnpm test --reporter=verbose utils.test.ts
```

### Performance Issues

- Use `--run` flag to skip watch mode
- Filter tests to run only what's needed
- Consider parallelization for large test suites

## Coverage Goals

Maintain high test coverage:

- **Unit tests**: >90% line coverage
- **Critical paths**: 100% coverage for error handling
- **Integration tests**: Cover all provider combinations
- **Edge cases**: Test boundary conditions and error scenarios

## Contributing Tests

When adding new features:

1. **Write tests first** (TDD approach)
2. **Test both success and failure cases**
3. **Include integration tests** for new providers
4. **Update fixtures** with new mock data
5. **Document test scenarios** in comments

For questions or issues with testing, please check existing issues or create a new one in the project repository.