import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BraveSearchProvider } from '../../../providers/search/brave/index.js';
import { mockBraveSearchResponse, mockErrorResponses } from '../../fixtures/mock-responses.js';
import { ProviderError, ErrorType } from '../../../common/types.js';

// Mock the config
vi.mock('../../../config/env.js', () => ({
	config: {
		search: {
			brave: {
				api_key: 'test-api-key',
				base_url: 'https://api.search.brave.com/res/v1',
				timeout: 10000,
			},
		},
	},
}));

// Mock fetch globally
global.fetch = vi.fn();

describe('BraveSearchProvider', () => {
	let provider: BraveSearchProvider;

	beforeEach(() => {
		provider = new BraveSearchProvider();
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
				json: async () => mockBraveSearchResponse,
			} as Response);

			const results = await provider.search({ query: 'test query' });

			expect(results).toHaveLength(1);
			expect(results[0]).toEqual({
				title: 'Brave Search Result',
				url: 'https://brave-example.com',
				snippet: 'Description from Brave Search',
				score: undefined,
				source_provider: 'brave',
			});

			expect(mockFetch).toHaveBeenCalledWith(
				expect.stringContaining('https://api.search.brave.com/res/v1/web/search'),
				expect.objectContaining({
					method: 'GET',
					headers: {
						'Accept': 'application/json',
						'X-Subscription-Token': 'test-api-key',
					},
				})
			);
		});

		it('should handle search operators in query', async () => {
			const mockFetch = vi.mocked(fetch);
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: async () => mockBraveSearchResponse,
			} as Response);

			await provider.search({ 
				query: 'test query site:example.com filetype:pdf' 
			});

			const callUrl = mockFetch.mock.calls[0][0] as string;
			expect(callUrl).toContain('q=test%20query%20site%3Aexample.com%20filetype%3Apdf');
		});

		it('should handle limit parameter', async () => {
			const mockFetch = vi.mocked(fetch);
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: async () => mockBraveSearchResponse,
			} as Response);

			await provider.search({ 
				query: 'test query',
				limit: 5
			});

			const callUrl = mockFetch.mock.calls[0][0] as string;
			expect(callUrl).toContain('count=5');
		});

		it('should handle unauthorized error', async () => {
			const mockFetch = vi.mocked(fetch);
			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 401,
				statusText: 'Unauthorized',
				json: async () => mockErrorResponses.unauthorized,
			} as Response);

			await expect(provider.search({ query: 'test' })).rejects.toThrow(ProviderError);

			try {
				await provider.search({ query: 'test' });
			} catch (error) {
				expect(error).toBeInstanceOf(ProviderError);
				expect((error as ProviderError).type).toBe(ErrorType.API_ERROR);
			}
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

		it('should handle empty results', async () => {
			const mockFetch = vi.mocked(fetch);
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: async () => ({ web: { results: [] } }),
			} as Response);

			const results = await provider.search({ query: 'test' });
			expect(results).toEqual([]);
		});

		it('should handle malformed response', async () => {
			const mockFetch = vi.mocked(fetch);
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: async () => ({}), // Missing web.results
			} as Response);

			const results = await provider.search({ query: 'test' });
			expect(results).toEqual([]);
		});

		it('should handle JSON parse error', async () => {
			const mockFetch = vi.mocked(fetch);
			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 400,
				statusText: 'Bad Request',
				json: async () => {
					throw new Error('Invalid JSON');
				},
			} as Response);

			await expect(provider.search({ query: 'test' })).rejects.toThrow(ProviderError);
		});

		it('should handle network timeout', async () => {
			const mockFetch = vi.mocked(fetch);
			mockFetch.mockRejectedValueOnce(new Error('Request timeout'));

			await expect(provider.search({ query: 'test' })).rejects.toThrow(ProviderError);
		});
	});

	describe('provider metadata', () => {
		it('should have correct name and description', () => {
			expect(provider.name).toBe('brave');
			expect(provider.description).toContain('Privacy-focused');
		});
	});
});