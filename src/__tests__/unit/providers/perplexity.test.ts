import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PerplexityProvider } from '../../../providers/ai_response/perplexity/index.js';
import { mockPerplexityResponse, mockErrorResponses } from '../../fixtures/mock-responses.js';

// Mock the config
vi.mock('../../../config/env.js', () => ({
	config: {
		ai_response: {
			perplexity: {
				api_key: 'test-api-key',
				base_url: 'https://api.perplexity.ai',
				timeout: 60000,
			},
		},
	},
}));

// Mock fetch globally
global.fetch = vi.fn();

describe('PerplexityProvider', () => {
	let provider: PerplexityProvider;

	beforeEach(() => {
		provider = new PerplexityProvider();
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
				json: async () => mockPerplexityResponse,
			} as Response);

			const results = await provider.search({ query: 'What is TypeScript?' });

			expect(results).toHaveLength(1);
			expect(results[0]).toHaveProperty('title');
			expect(results[0]).toHaveProperty('url');
			expect(results[0]).toHaveProperty('snippet');
			expect(results[0]).toHaveProperty('source_provider', 'perplexity');
		});

		it('should handle errors gracefully', async () => {
			const mockFetch = vi.mocked(fetch);
			mockFetch.mockRejectedValueOnce(new Error('Network error'));

			await expect(provider.search({ query: 'test' })).rejects.toThrow();
		});
	});

	describe('provider metadata', () => {
		it('should have correct name and description', () => {
			expect(provider.name).toBe('perplexity');
			expect(provider.description).toContain('AI-powered');
		});
	});
});