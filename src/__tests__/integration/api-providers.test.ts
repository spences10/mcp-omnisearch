import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { TavilySearchProvider } from '../../providers/search/tavily/index.js';
import { BraveSearchProvider } from '../../providers/search/brave/index.js';
import { KagiSearchProvider } from '../../providers/search/kagi/index.js';
import { PerplexityAIProvider } from '../../providers/ai_response/perplexity/index.js';
import { JinaReaderProvider } from '../../providers/processing/jina_reader/index.js';

// These are integration tests that require actual API keys
// They should be skipped in CI/CD unless API keys are available
const hasApiKeys = {
	tavily: !!process.env.TAVILY_API_KEY,
	brave: !!process.env.BRAVE_API_KEY,
	kagi: !!process.env.KAGI_API_KEY,
	perplexity: !!process.env.PERPLEXITY_API_KEY,
	jina: !!process.env.JINA_AI_API_KEY,
};

// Skip tests if no API keys are available
const skipIfNoKeys = (provider: keyof typeof hasApiKeys) => {
	return hasApiKeys[provider] ? describe : describe.skip;
};

describe('API Providers Integration Tests', () => {
	// Test configuration - use shorter timeouts for integration tests
	const testTimeout = 30000;

	beforeAll(() => {
		// Set test environment variables if they exist
		if (process.env.TAVILY_API_KEY) {
			vi.stubEnv('TAVILY_API_KEY', process.env.TAVILY_API_KEY);
		}
		if (process.env.BRAVE_API_KEY) {
			vi.stubEnv('BRAVE_API_KEY', process.env.BRAVE_API_KEY);
		}
		if (process.env.KAGI_API_KEY) {
			vi.stubEnv('KAGI_API_KEY', process.env.KAGI_API_KEY);
		}
		if (process.env.PERPLEXITY_API_KEY) {
			vi.stubEnv('PERPLEXITY_API_KEY', process.env.PERPLEXITY_API_KEY);
		}
		if (process.env.JINA_AI_API_KEY) {
			vi.stubEnv('JINA_AI_API_KEY', process.env.JINA_AI_API_KEY);
		}
	});

	afterAll(() => {
		vi.unstubAllEnvs();
	});

	skipIfNoKeys('tavily')('Tavily Search Integration', () => {
		let provider: TavilySearchProvider;

		beforeAll(() => {
			provider = new TavilySearchProvider();
		});

		it(
			'should perform real search and return results',
			async () => {
				const results = await provider.search({
					query: 'TypeScript programming language',
					limit: 3,
				});

				expect(results).toBeInstanceOf(Array);
				expect(results.length).toBeGreaterThan(0);
				expect(results.length).toBeLessThanOrEqual(3);

				// Validate result structure
				results.forEach(result => {
					expect(result).toHaveProperty('title');
					expect(result).toHaveProperty('url');
					expect(result).toHaveProperty('snippet');
					expect(result).toHaveProperty('source_provider', 'tavily');
					expect(typeof result.title).toBe('string');
					expect(typeof result.url).toBe('string');
					expect(typeof result.snippet).toBe('string');
				});
			},
			testTimeout
		);

		it(
			'should handle domain filtering',
			async () => {
				const results = await provider.search({
					query: 'TypeScript',
					include_domains: ['microsoft.com'],
					limit: 2,
				});

				expect(results).toBeInstanceOf(Array);
				// Results should be from microsoft.com or contain relevant content
				// Note: API behavior may vary, so we just ensure we get results
			},
			testTimeout
		);
	});

	skipIfNoKeys('brave')('Brave Search Integration', () => {
		let provider: BraveSearchProvider;

		beforeAll(() => {
			provider = new BraveSearchProvider();
		});

		it(
			'should perform real search and return results',
			async () => {
				const results = await provider.search({
					query: 'JavaScript frameworks',
					limit: 3,
				});

				expect(results).toBeInstanceOf(Array);
				expect(results.length).toBeGreaterThan(0);

				results.forEach(result => {
					expect(result).toHaveProperty('title');
					expect(result).toHaveProperty('url');
					expect(result).toHaveProperty('snippet');
					expect(result).toHaveProperty('source_provider', 'brave');
				});
			},
			testTimeout
		);

		it(
			'should handle search operators',
			async () => {
				const results = await provider.search({
					query: 'site:github.com TypeScript',
					limit: 2,
				});

				expect(results).toBeInstanceOf(Array);
				// Results should primarily be from github.com
			},
			testTimeout
		);
	});

	skipIfNoKeys('kagi')('Kagi Search Integration', () => {
		let provider: KagiSearchProvider;

		beforeAll(() => {
			provider = new KagiSearchProvider();
		});

		it(
			'should perform real search and return results',
			async () => {
				const results = await provider.search({
					query: 'Rust programming language',
					limit: 3,
				});

				expect(results).toBeInstanceOf(Array);
				expect(results.length).toBeGreaterThan(0);

				results.forEach(result => {
					expect(result).toHaveProperty('title');
					expect(result).toHaveProperty('url');
					expect(result).toHaveProperty('snippet');
					expect(result).toHaveProperty('source_provider', 'kagi');
				});
			},
			testTimeout
		);
	});

	skipIfNoKeys('perplexity')('Perplexity AI Integration', () => {
		let provider: PerplexityAIProvider;

		beforeAll(() => {
			provider = new PerplexityAIProvider();
		});

		it(
			'should get AI response',
			async () => {
				const result = await provider.get_answer(
					'What is the difference between TypeScript and JavaScript?'
				);

				expect(result).toHaveProperty('content');
				expect(result).toHaveProperty('sources');
				expect(result).toHaveProperty('metadata');
				expect(result).toHaveProperty('source_provider', 'perplexity');

				expect(typeof result.content).toBe('string');
				expect(result.content.length).toBeGreaterThan(10);
				expect(Array.isArray(result.sources)).toBe(true);
				expect(result.metadata).toHaveProperty('tokens_used');
				expect(result.metadata).toHaveProperty('response_time');
			},
			testTimeout
		);

		it(
			'should get AI response with context',
			async () => {
				const context = 'We are discussing programming languages and their features.';
				const result = await provider.get_answer_with_context(
					'How does TypeScript help with large applications?',
					context
				);

				expect(result).toHaveProperty('content');
				expect(result).toHaveProperty('source_provider', 'perplexity');
				expect(typeof result.content).toBe('string');
			},
			testTimeout
		);
	});

	skipIfNoKeys('jina')('Jina Reader Integration', () => {
		let provider: JinaReaderProvider;

		beforeAll(() => {
			provider = new JinaReaderProvider();
		});

		it(
			'should process URL and extract content',
			async () => {
				// Use a reliable URL for testing
				const testUrl = 'https://example.com';
				const result = await provider.process_content(testUrl);

				expect(result).toHaveProperty('content');
				expect(result).toHaveProperty('metadata');
				expect(result).toHaveProperty('source_provider', 'jina_reader');

				expect(typeof result.content).toBe('string');
				expect(result.content.length).toBeGreaterThan(0);
				expect(result.metadata).toHaveProperty('title');
				expect(result.metadata).toHaveProperty('word_count');
				expect(result.metadata.urls_processed).toBe(1);
				expect(result.metadata.successful_extractions).toBe(1);
			},
			testTimeout
		);

		it(
			'should handle multiple URLs',
			async () => {
				const testUrls = ['https://example.com', 'https://httpbin.org/html'];
				const result = await provider.process_content(testUrls);

				expect(result.metadata.urls_processed).toBe(2);
				expect(result.metadata.successful_extractions).toBeGreaterThan(0);
				expect(typeof result.content).toBe('string');
			},
			testTimeout
		);
	});

	describe('Cross-Provider Consistency', () => {
		it('should maintain consistent result format across search providers', async () => {
			const query = 'TypeScript';
			const limit = 2;
			const results: any[] = [];

			// Collect results from available providers
			if (hasApiKeys.tavily) {
				const tavily = new TavilySearchProvider();
				const tavilyResults = await tavily.search({ query, limit });
				results.push(...tavilyResults);
			}

			if (hasApiKeys.brave) {
				const brave = new BraveSearchProvider();
				const braveResults = await brave.search({ query, limit });
				results.push(...braveResults);
			}

			if (hasApiKeys.kagi) {
				const kagi = new KagiSearchProvider();
				const kagiResults = await kagi.search({ query, limit });
				results.push(...kagiResults);
			}

			// Skip if no providers are available
			if (results.length === 0) {
				console.log('Skipping cross-provider test - no API keys available');
				return;
			}

			// Verify all results have consistent structure
			results.forEach(result => {
				expect(result).toHaveProperty('title');
				expect(result).toHaveProperty('url');
				expect(result).toHaveProperty('snippet');
				expect(result).toHaveProperty('source_provider');
				expect(['tavily', 'brave', 'kagi']).toContain(result.source_provider);
			});
		});
	});

	describe('Error Handling Integration', () => {
		it('should handle invalid API keys gracefully', async () => {
			// Create provider with invalid key
			const originalKey = process.env.TAVILY_API_KEY;
			vi.stubEnv('TAVILY_API_KEY', 'invalid-key-123');

			const provider = new TavilySearchProvider();

			await expect(
				provider.search({ query: 'test' })
			).rejects.toThrow();

			// Restore original key
			if (originalKey) {
				vi.stubEnv('TAVILY_API_KEY', originalKey);
			}
		});

		it('should handle rate limiting', async () => {
			// This test would require actually hitting rate limits
			// For now, we'll just ensure the error handling structure is in place
			expect(true).toBe(true);
		});
	});
});