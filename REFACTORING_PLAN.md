# MCP Omnisearch Refactoring Plan

## Overview

Validated plan to eliminate code duplication and improve
maintainability in the MCP Omnisearch codebase. Based on comprehensive
analysis, we identified **~1,400 lines of duplicated code** across 21
provider files.

## Validated Duplication Metrics

| Category             | Duplicate Lines  | Files  | Impact                      |
| -------------------- | ---------------- | ------ | --------------------------- |
| Firecrawl providers  | 365-380          | 5      | High                        |
| Processing providers | 603              | 10     | High                        |
| Search providers     | 248              | 5      | Medium                      |
| Tool registration    | 192              | 1      | Medium                      |
| **Total**            | **~1,408 lines** | **21** | **26% reduction potential** |

## Implementation Strategy

### Principle: Incremental, Isolated Steps

Each step can be implemented independently without breaking existing
functionality. All changes maintain backward compatibility.

---

## Phase 1: Foundation Infrastructure

### Step 1.1: Create Base HTTP Client Utility

**File**: `src/common/http-client.ts` **Estimated Time**: 2-3 hours
**Impact**: Eliminates 200+ lines of duplicate fetch/retry logic

```typescript
// New utility to centralize:
// - fetch() with timeout
// - retry_with_backoff integration
// - standard error handling for HTTP status codes
// - API key injection
```

**Success Criteria**:

- ✅ All HTTP status codes (401, 403, 429, 500) handled consistently
- ✅ Configurable timeout and retry patterns
- ✅ Tests covering error scenarios

**Files That Will Use This**: All 21 provider files

---

### Step 1.2: Create Error Handler Utility

**File**: `src/common/error-handler.ts` **Estimated Time**: 1-2 hours
**Impact**: Eliminates 150+ lines of duplicate error mapping

```typescript
// Standardizes HTTP status → ProviderError mapping
// Used by http-client but also available standalone
```

**Success Criteria**:

- ✅ Consistent error messages across all providers
- ✅ Proper error type mapping (API_ERROR, RATE_LIMIT, etc.)
- ✅ Provider name injection

**Dependencies**: None

---

### Step 1.3: Create Validation Utilities

**File**: `src/common/validation.ts` **Estimated Time**: 1-2 hours
**Impact**: Eliminates 80+ lines of duplicate validation

```typescript
// Centralizes:
// - URL validation patterns
// - API key validation
// - Parameter validation helpers
```

**Success Criteria**:

- ✅ URL validation works for single/multiple URLs
- ✅ API key validation with descriptive errors
- ✅ Reusable parameter validators

**Dependencies**: None

---

## Phase 2: Abstract Base Classes

### Step 2.1: Create AbstractSearchProvider

**File**: `src/common/abstract-search-provider.ts` **Estimated Time**:
3-4 hours **Impact**: Eliminates 150+ lines from search providers

```typescript
// Base class containing:
// - Common imports
// - Standard error handling
// - API key validation
// - retry_with_backoff integration
// - SearchResult mapping helpers
```

**Success Criteria**:

- ✅ Tavily provider can extend it without functionality loss
- ✅ All common patterns moved to base class
- ✅ Provider-specific logic remains in subclasses

**Dependencies**: Step 1.1, 1.2, 1.3

---

### Step 2.2: Create AbstractProcessingProvider

**File**: `src/common/abstract-processing-provider.ts` **Estimated
Time**: 3-4 hours **Impact**: Eliminates 300+ lines from processing
providers

```typescript
// Base class containing:
// - Common imports and setup
// - URL validation patterns
// - Standard error handling
// - Result aggregation helpers
// - Metadata calculation
```

**Success Criteria**:

- ✅ Non-Firecrawl provider can extend it successfully
- ✅ All common processing patterns abstracted
- ✅ Provider-specific response parsing preserved

**Dependencies**: Step 1.1, 1.2, 1.3

---

## Phase 3: Provider Consolidation

### Step 3.1: Consolidate Firecrawl Providers (HIGH IMPACT)

**Files**: Replace 5 files with 1 configurable provider **Estimated
Time**: 6-8 hours  
**Impact**: Eliminates 365+ lines, reduces 5 files to 1

```typescript
// Single FirecrawlProvider with mode parameter:
// - scrape, crawl, map, extract, actions modes
// - Shared polling logic for async operations
// - Common error handling and validation
// - Mode-specific request/response handling
```

**Success Criteria**:

- ✅ All existing tool names continue to work
- ✅ All Firecrawl functionality preserved
- ✅ Single provider handles all 5 modes
- ✅ Reduced maintenance burden

**Dependencies**: Step 1.1, 1.2, 1.3, 2.2

**Implementation Order**:

1. Create unified FirecrawlProvider class
2. Test each mode thoroughly
3. Update tool registration to use new provider
4. Remove old provider files
5. Update exports

---

### Step 3.2: Migrate Search Providers to Base Class

**Files**: `src/providers/search/*/index.ts` (5 files) **Estimated
Time**: 4-6 hours **Impact**: Eliminates 150+ lines of duplication

**Order of Migration**:

1. **Tavily** (simplest, good test case)
2. **Brave** (similar to Tavily)
3. **Kagi** (adds complexity)
4. **Exa** (different response format)
5. **GitHub** (most different, uses Octokit)

**Success Criteria per Provider**:

- ✅ Extends AbstractSearchProvider
- ✅ All functionality preserved
- ✅ Tests pass
- ✅ Reduced line count

**Dependencies**: Step 2.1

---

### Step 3.3: Migrate Processing Providers to Base Class

**Files**: Non-Firecrawl processing providers (5 files) **Estimated
Time**: 6-8 hours **Impact**: Eliminates 200+ lines

**Order of Migration**:

1. **Jina Reader** (simplest)
2. **Kagi Summarizer** (similar pattern)
3. **Tavily Extract** (more complex)
4. **Exa Contents** (different response handling)
5. **Exa Similar** (most complex)

**Dependencies**: Step 2.2

---

## Phase 4: Tool Registration Optimization

### Step 4.1: Create Schema Generator Utility

**File**: `src/server/schema-generator.ts` **Estimated Time**: 4-5
hours **Impact**: Eliminates 100+ lines from tools.ts

```typescript
// Generate MCP tool schemas programmatically:
// - searchProviderSchema(providerName)
// - processingProviderSchema(providerName, options)
// - enhancementProviderSchema(providerName)
```

**Success Criteria**:

- ✅ All existing schemas reproduced exactly
- ✅ Easy to add new provider types
- ✅ Type-safe schema generation

**Dependencies**: None

---

### Step 4.2: Simplify Tool Registration

**File**: `src/server/tools.ts`  
**Estimated Time**: 3-4 hours **Impact**: Eliminates 150+ lines of
repetitive code

```typescript
// Replace repetitive patterns with:
// - Dynamic schema generation
// - Generic parameter validation
// - Standardized error responses
```

**Success Criteria**:

- ✅ 70% reduction in tools.ts line count
- ✅ All existing functionality preserved
- ✅ Easier to add new tools

**Dependencies**: Step 4.1

---

## Phase 5: Import and Type Optimization

### Step 5.1: Create Barrel Exports

**Files**: Various index files **Estimated Time**: 1-2 hours  
**Impact**: Cleaner imports across providers

**Success Criteria**:

- ✅ Consolidated common imports
- ✅ Easier import management
- ✅ No functionality changes

**Dependencies**: All previous steps completed

---

## Implementation Timeline

### Week 1: Foundation (Steps 1.1-1.3)

- HTTP Client, Error Handler, Validation utilities
- **Impact**: Foundation for all other work

### Week 2: Base Classes (Steps 2.1-2.2)

- AbstractSearchProvider, AbstractProcessingProvider
- **Impact**: Enables provider migrations

### Week 3: High Impact Consolidation (Step 3.1)

- Firecrawl provider consolidation
- **Impact**: Largest single reduction (~365 lines)

### Week 4: Provider Migrations (Steps 3.2-3.3)

- Migrate search and processing providers
- **Impact**: Additional ~350 lines eliminated

### Week 5: Tool Registration (Steps 4.1-4.2)

- Schema generation and tool simplification
- **Impact**: ~150 lines eliminated, easier maintenance

### Week 6: Polish (Step 5.1)

- Import optimization and cleanup
- **Impact**: Developer experience improvements

---

## Expected Outcomes

### Quantitative Benefits

- **Lines eliminated**: ~1,400 lines (26% reduction)
- **Files consolidated**: 21 → ~17 files
- **Maintenance points**: 21 → ~6 base classes/utilities

### Qualitative Benefits

- **Consistency**: Fix bugs once, not 21 times
- **Testing**: Test base classes instead of each provider
- **Development Speed**: New providers inherit common functionality
- **Code Quality**: Standardized error handling and patterns

### Backward Compatibility

- **Tool Names**: All existing MCP tool names preserved
- **APIs**: All existing parameter/response formats maintained
- **Migration**: Zero breaking changes for users

---

## Risk Mitigation

### Testing Strategy

1. **Unit tests for utilities** before any provider uses them
2. **Integration tests** for each migrated provider
3. **Regression tests** to ensure existing functionality
4. **Provider-by-provider migration** with validation at each step

### Rollback Plan

- Each step is independent and can be reverted
- Git commits structured to allow clean rollbacks
- Feature flags for new base classes during transition

### Quality Gates

- All tests must pass before proceeding to next step
- Code review required for base class changes
- Performance validation (no regression in response times)

---

## Getting Started

**First Step**: Implement Step 1.1 (HTTP Client Utility)

- Smallest, most isolated change
- Provides immediate value
- Tests the foundation approach
- Can be implemented without touching existing providers

**Command to begin**:

```bash
# Create the HTTP client utility
touch src/common/http-client.ts
```

This plan transforms the codebase incrementally while maintaining full
backward compatibility and testability at each step.
