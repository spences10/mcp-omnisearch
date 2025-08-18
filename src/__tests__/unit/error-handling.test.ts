import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TavilySearchProvider } from '../../providers/search/tavily/index.js';
import { BraveSearchProvider } from '../../providers/search/brave/index.js';
import { PerplexityAIProvider } from '../../providers/ai_response/perplexity/index.js';
import { JinaReaderProvider } from '../../providers/processing/jina_reader/index.js';
import { ProviderError, ErrorType } from '../../common/types.js';
import { mockErrorResponses } from '../fixtures/mock-responses.js';

// Mock the config
vi.mock('../../config/env.js', () => ({
	config: {
		search: {
			tavily: {
				api_key: 'test-api-key',
				base_url: 'https://api.tavily.com',
				timeout: 30000,
			},
			brave: {
				api_key: 'test-api-key',
				base_url: 'https://api.search.brave.com/res/v1',
				timeout: 10000,
			},
		},
		ai_response: {
			perplexity: {
				api_key: 'test-api-key',
				base_url: 'https://api.perplexity.ai',
				timeout: 60000,
			},
		},
		processing: {
			jina_reader: {
				api_key: 'test-api-key',
				base_url: 'https://api.jina.ai/v1/reader',
				timeout: 30000,
			},
		},
	},
}));

// Mock fetch globally
global.fetch = vi.fn();

describe('Error Handling Scenarios', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('HTTP Error Status Codes', () => {
		const providers = [
			{ name: 'Tavily', provider: () => new TavilySearchProvider(), method: 'search' },
			{ name: 'Brave', provider: () => new BraveSearchProvider(), method: 'search' },
			{ name: 'Perplexity', provider: () => new PerplexityAIProvider(), method: 'get_answer' },
			{ name: 'Jina Reader', provider: () => new JinaReaderProvider(), method: 'process_content' },
		];

		providers.forEach(({ name, provider: createProvider, method }) => {
			describe(`${name} Error Handling`, () => {
				let provider: any;

				beforeEach(() => {
					provider = createProvider();
				});

				it('should handle 400 Bad Request', async () => {
					const mockFetch = vi.mocked(fetch);
					mockFetch.mockResolvedValueOnce({
						ok: false,
						status: 400,
						statusText: 'Bad Request',
						json: async () => mockErrorResponses.badRequest,
					} as Response);

					const methodArgs = method === 'search' 
						? [{ query: 'test' }]
						: method === 'get_answer'
						? ['test question']
						: ['https://example.com'];

					await expect(provider[method](...methodArgs)).rejects.toThrow();
				});

				it('should handle 401 Unauthorized', async () => {
					const mockFetch = vi.mocked(fetch);
					mockFetch.mockResolvedValueOnce({
						ok: false,
						status: 401,
						statusText: 'Unauthorized',
						json: async () => mockErrorResponses.unauthorized,
					} as Response);

					const methodArgs = method === 'search' 
						? [{ query: 'test' }]
						: method === 'get_answer'
						? ['test question']
						: ['https://example.com'];

					await expect(provider[method](...methodArgs)).rejects.toThrow();
				});

				it('should handle 429 Rate Limited', async () => {
					const mockFetch = vi.mocked(fetch);
					mockFetch.mockResolvedValueOnce({
						ok: false,
						status: 429,
						statusText: 'Too Many Requests',
						json: async () => mockErrorResponses.rateLimited,
					} as Response);

					const methodArgs = method === 'search' 
						? [{ query: 'test' }]
						: method === 'get_answer'
						? ['test question']
						: ['https://example.com'];

					await expect(provider[method](...methodArgs)).rejects.toThrow();
				});

				it('should handle 500 Internal Server Error', async () => {
					const mockFetch = vi.mocked(fetch);
					mockFetch.mockResolvedValueOnce({
						ok: false,
						status: 500,
						statusText: 'Internal Server Error',
						json: async () => mockErrorResponses.internalError,
					} as Response);

					const methodArgs = method === 'search' 
						? [{ query: 'test' }]
						: method === 'get_answer'
						? ['test question']
						: ['https://example.com'];

					await expect(provider[method](...methodArgs)).rejects.toThrow();
				});

				it('should handle network timeout', async () => {
					const mockFetch = vi.mocked(fetch);
					mockFetch.mockRejectedValueOnce(new Error('Request timeout'));

					const methodArgs = method === 'search' 
						? [{ query: 'test' }]
						: method === 'get_answer'
						? ['test question']
						: ['https://example.com'];

					await expect(provider[method](...methodArgs)).rejects.toThrow();
				});

				it('should handle malformed JSON response', async () => {
					const mockFetch = vi.mocked(fetch);
					mockFetch.mockResolvedValueOnce({
						ok: false,
						status: 400,
						statusText: 'Bad Request',
						json: async () => {
							throw new Error('Invalid JSON');
						},
					} as Response);

					const methodArgs = method === 'search' 
						? [{ query: 'test' }]
						: method === 'get_answer'
						? ['test question']
						: ['https://example.com'];

					await expect(provider[method](...methodArgs)).rejects.toThrow();
				});
			});
		});
	});

	describe('Input Validation Errors', () => {
		it('should handle invalid URLs in JinaReader', async () => {
			const provider = new JinaReaderProvider();

			await expect(provider.process_content('not-a-url')).rejects.toThrow(ProviderError);
			await expect(provider.process_content('')).rejects.toThrow(ProviderError);
			await expect(provider.process_content([])).rejects.toThrow(ProviderError);
		});

		it('should handle empty search queries', async () => {
			const provider = new TavilySearchProvider();
			const mockFetch = vi.mocked(fetch);
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: async () => ({ results: [] }),
			} as Response);

			// Should still work with empty query after sanitization
			const results = await provider.search({ query: '   ' });
			expect(results).toEqual([]);
		});
	});

	describe('Retry Logic and Backoff', () => {
		it('should retry on transient failures', async () => {
			const provider = new TavilySearchProvider();
			const mockFetch = vi.mocked(fetch);

			// Mock first call to fail, second to succeed
			mockFetch
				.mockRejectedValueOnce(new Error('Temporary network error'))
				.mockResolvedValueOnce({
					ok: true,
					status: 200,
					json: async () => ({ results: [] }),
				} as Response);

			const results = await provider.search({ query: 'test' });
			expect(results).toEqual([]);
			expect(mockFetch).toHaveBeenCalledTimes(2);
		});

		it('should eventually give up after max retries', async () => {
			const provider = new TavilySearchProvider();
			const mockFetch = vi.mocked(fetch);

			// Mock all calls to fail
			mockFetch.mockRejectedValue(new Error('Persistent network error'));

			await expect(provider.search({ query: 'test' })).rejects.toThrow();
			
			// Should have tried multiple times (initial + retries)
			expect(mockFetch).toHaveBeenCalledTimes(4); // 1 + 3 retries
		});
	});

	describe('Provider Error Classification', () => {
		it('should correctly classify different error types', () => {
			const apiError = new ProviderError(
				ErrorType.API_ERROR,
				'API returned error',
				'test-provider'
			);
			expect(apiError.type).toBe(ErrorType.API_ERROR);

			const rateLimitError = new ProviderError(
				ErrorType.RATE_LIMIT,
				'Rate limit exceeded',
				'test-provider'
			);
			expect(rateLimitError.type).toBe(ErrorType.RATE_LIMIT);

			const invalidInputError = new ProviderError(
				ErrorType.INVALID_INPUT,
				'Invalid input provided',
				'test-provider'
			);
			expect(invalidInputError.type).toBe(ErrorType.INVALID_INPUT);

			const providerError = new ProviderError(
				ErrorType.PROVIDER_ERROR,
				'Provider internal error',
				'test-provider'
			);
			expect(providerError.type).toBe(ErrorType.PROVIDER_ERROR);
		});
	});

	describe('Partial Failure Handling', () => {
		it('should handle partial failures in multi-URL processing', async () => {
			const provider = new JinaReaderProvider();
			const mockFetch = vi.mocked(fetch);

			// Mock first URL to succeed, second to fail
			mockFetch
				.mockResolvedValueOnce({
					ok: true,
					status: 200,
					json: async () => ({
						code: 200,
						status: 20000,
						data: {
							title: 'Success',
							content: 'Content from first URL',
							url: 'https://example.com/success',
						},
					}),
				} as Response)
				.mockResolvedValueOnce({
					ok: false,
					status: 404,
					statusText: 'Not Found',
				} as Response);

			const urls = ['https://example.com/success', 'https://example.com/missing'];
			const result = await provider.process_content(urls);

			expect(result.metadata.urls_processed).toBe(2);
			expect(result.metadata.successful_extractions).toBe(1);
			expect(result.metadata.failed_urls).toEqual(['https://example.com/missing']);
			expect(result.content).toContain('Content from first URL');
		});
	});

	describe('Timeout Handling', () => {
		it('should handle request timeouts gracefully', async () => {
			const provider = new TavilySearchProvider();
			const mockFetch = vi.mocked(fetch);

			// Mock timeout error
			mockFetch.mockRejectedValue(new Error('Request timeout'));

			await expect(provider.search({ query: 'test' })).rejects.toThrow();
		});
	});

	describe('Response Format Validation', () => {
		it('should handle unexpected response formats', async () => {
			const provider = new PerplexityAIProvider();
			const mockFetch = vi.mocked(fetch);

			// Mock response with missing required fields
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: async () => ({
					// Missing choices array
					id: 'test',
					model: 'test-model',
				}),
			} as Response);

			await expect(provider.get_answer('test')).rejects.toThrow(
				'Invalid response format'
			);
		});

		it('should handle empty response data', async () => {
			const provider = new TavilySearchProvider();
			const mockFetch = vi.mocked(fetch);

			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: async () => ({}), // Empty response
			} as Response);

			const results = await provider.search({ query: 'test' });
			expect(results).toEqual([]);
		});
	});
});