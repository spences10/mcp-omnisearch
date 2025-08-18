import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TavilySearchProvider } from '../../../providers/search/tavily/index.js';
import { mockTavilySearchResponse, mockErrorResponses } from '../../fixtures/mock-responses.js';
import { ProviderError, ErrorType } from '../../../common/types.js';

// Mock the config
vi.mock('../../../config/env.js', () => ({
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

// Mock fetch globally
global.fetch = vi.fn();

describe('TavilySearchProvider', () => {
	let provider: TavilySearchProvider;

	beforeEach(() => {
		provider = new TavilySearchProvider();
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('search', () => {
		it('should perform successful search', async () => {
			const mockFetch = vi.mocked(fetch);
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: async () => mockTavilySearchResponse,
			} as Response);

			const results = await provider.search({ query: 'test query' });

			expect(results).toHaveLength(2);
			expect(results[0]).toEqual({
				title: 'Example Search Result',
				url: 'https://example.com/article',
				snippet: 'This is an example search result content',
				score: 0.9,
				source_provider: 'tavily',
			});

			expect(mockFetch).toHaveBeenCalledWith(
				'https://api.tavily.com/search',
				expect.objectContaining({
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						Authorization: 'Bearer test-api-key',
					},
					body: JSON.stringify({
						query: 'test query',
						max_results: 5,
						include_domains: [],
						exclude_domains: [],
						search_depth: 'basic',
						topic: 'general',
					}),
				})
			);
		});

		it('should handle domain filtering', async () => {
			const mockFetch = vi.mocked(fetch);
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: async () => mockTavilySearchResponse,
			} as Response);

			await provider.search({
				query: 'test query',
				include_domains: ['example.com'],
				exclude_domains: ['spam.com'],
			});

			expect(mockFetch).toHaveBeenCalledWith(
				'https://api.tavily.com/search',
				expect.objectContaining({
					body: JSON.stringify({
						query: 'test query',
						max_results: 5,
						include_domains: ['example.com'],
						exclude_domains: ['spam.com'],
						search_depth: 'basic',
						topic: 'general',
					}),
				})
			);
		});

		it('should handle unauthorized error', async () => {
			const mockFetch = vi.mocked(fetch);
			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 401,
				statusText: 'Unauthorized',
				json: async () => mockErrorResponses.unauthorized,
			} as Response);

			await expect(provider.search({ query: 'test' })).rejects.toThrow();
		});

		it('should handle rate limit error', async () => {
			const mockFetch = vi.mocked(fetch);
			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 429,
				statusText: 'Too Many Requests',
				json: async () => mockErrorResponses.rateLimited,
			} as Response);

			await expect(provider.search({ query: 'test' })).rejects.toThrow(ProviderError);
			
			try {
				await provider.search({ query: 'test' });
			} catch (error) {
				expect(error).toBeInstanceOf(ProviderError);
				expect((error as ProviderError).type).toBe(ErrorType.RATE_LIMIT);
			}
		});

		it('should handle bad request error', async () => {
			const mockFetch = vi.mocked(fetch);
			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 400,
				statusText: 'Bad Request',
				json: async () => mockErrorResponses.badRequest,
			} as Response);

			await expect(provider.search({ query: 'test' })).rejects.toThrow(ProviderError);

			try {
				await provider.search({ query: 'test' });
			} catch (error) {
				expect(error).toBeInstanceOf(ProviderError);
				expect((error as ProviderError).type).toBe(ErrorType.INVALID_INPUT);
			}
		});

		it('should handle internal server error', async () => {
			const mockFetch = vi.mocked(fetch);
			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 500,
				statusText: 'Internal Server Error',
				json: async () => mockErrorResponses.internalError,
			} as Response);

			await expect(provider.search({ query: 'test' })).rejects.toThrow(ProviderError);

			try {
				await provider.search({ query: 'test' });
			} catch (error) {
				expect(error).toBeInstanceOf(ProviderError);
				expect((error as ProviderError).type).toBe(ErrorType.PROVIDER_ERROR);
			}
		});

		it('should handle network error', async () => {
			const mockFetch = vi.mocked(fetch);
			mockFetch.mockRejectedValueOnce(new Error('Network error'));

			await expect(provider.search({ query: 'test' })).rejects.toThrow(ProviderError);
		});

		it('should sanitize query input', async () => {
			const mockFetch = vi.mocked(fetch);
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: async () => mockTavilySearchResponse,
			} as Response);

			await provider.search({ query: '  test\nquery\r\n  ' });

			expect(mockFetch).toHaveBeenCalledWith(
				'https://api.tavily.com/search',
				expect.objectContaining({
					body: JSON.stringify({
						query: 'test query',
						max_results: 5,
						include_domains: [],
						exclude_domains: [],
						search_depth: 'basic',
						topic: 'general',
					}),
				})
			);
		});
	});

	describe('provider metadata', () => {
		it('should have correct name and description', () => {
			expect(provider.name).toBe('tavily');
			expect(provider.description).toContain('Tavily Search');
		});
	});
});