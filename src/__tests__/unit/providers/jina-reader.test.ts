import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { JinaReaderProvider } from '../../../providers/processing/jina_reader/index.js';
import { mockJinaReaderResponse, mockErrorResponses } from '../../fixtures/mock-responses.js';
import { ProviderError, ErrorType } from '../../../common/types.js';

// Mock the config
vi.mock('../../../config/env.js', () => ({
	config: {
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

describe('JinaReaderProvider', () => {
	let provider: JinaReaderProvider;

	beforeEach(() => {
		provider = new JinaReaderProvider();
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('process_content', () => {
		it('should process single URL successfully', async () => {
			const mockFetch = vi.mocked(fetch);
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: async () => mockJinaReaderResponse,
			} as Response);

			const result = await provider.process_content('https://example.com/article');

			expect(result).toEqual({
				content: 'This is the clean content extracted by Jina Reader.',
				metadata: {
					title: 'Example Article Title',
					word_count: expect.any(Number),
					urls_processed: 1,
					successful_extractions: 1,
					failed_urls: [],
					extract_depth: 'basic',
				},
				source_provider: 'jina_reader',
			});

			expect(mockFetch).toHaveBeenCalledWith(
				'https://r.jina.ai/',
				expect.objectContaining({
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						Authorization: 'Bearer test-api-key',
					},
					body: JSON.stringify({
						url: 'https://example.com/article',
					}),
				})
			);
		});

		it('should process multiple URLs successfully', async () => {
			const mockFetch = vi.mocked(fetch);
			mockFetch
				.mockResolvedValueOnce({
					ok: true,
					status: 200,
					json: async () => mockJinaReaderResponse,
				} as Response)
				.mockResolvedValueOnce({
					ok: true,
					status: 200,
					json: async () => ({
						...mockJinaReaderResponse,
						data: {
							...mockJinaReaderResponse.data,
							title: 'Second Article',
							content: 'Second article content',
						},
					}),
				} as Response);

			const urls = ['https://example.com/article1', 'https://example.com/article2'];
			const result = await provider.process_content(urls);

			expect(result.metadata.urls_processed).toBe(2);
			expect(result.metadata.successful_extractions).toBe(2);
			expect(result.content).toContain('This is the clean content extracted by Jina Reader.');
			expect(result.content).toContain('Second article content');
			expect(mockFetch).toHaveBeenCalledTimes(2);
		});

		it('should handle advanced extract depth', async () => {
			const mockFetch = vi.mocked(fetch);
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: async () => mockJinaReaderResponse,
			} as Response);

			const result = await provider.process_content(
				'https://example.com/article',
				'advanced'
			);

			expect(result.metadata.extract_depth).toBe('advanced');
		});

		it('should handle API error responses', async () => {
			const mockFetch = vi.mocked(fetch);
			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 401,
				statusText: 'Unauthorized',
			} as Response);

			await expect(
				provider.process_content('https://example.com/article')
			).rejects.toThrow('API request failed with status 401');
		});

		it('should handle malformed response', async () => {
			const mockFetch = vi.mocked(fetch);
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: async () => ({}), // Missing required fields
			} as Response);

			await expect(
				provider.process_content('https://example.com/article')
			).rejects.toThrow('Invalid response format from Jina Reader');
		});

		it('should handle network error', async () => {
			const mockFetch = vi.mocked(fetch);
			mockFetch.mockRejectedValueOnce(new Error('Network error'));

			await expect(
				provider.process_content('https://example.com/article')
			).rejects.toThrow(ProviderError);
		});

		it('should handle partial failures with multiple URLs', async () => {
			const mockFetch = vi.mocked(fetch);
			mockFetch
				.mockResolvedValueOnce({
					ok: true,
					status: 200,
					json: async () => mockJinaReaderResponse,
				} as Response)
				.mockResolvedValueOnce({
					ok: false,
					status: 404,
					statusText: 'Not Found',
				} as Response);

			const urls = ['https://example.com/article1', 'https://example.com/missing'];
			const result = await provider.process_content(urls);

			expect(result.metadata.urls_processed).toBe(2);
			expect(result.metadata.successful_extractions).toBe(1);
			expect(result.metadata.failed_urls).toEqual(['https://example.com/missing']);
		});

		it('should validate URL format', async () => {
			await expect(provider.process_content('not-a-url')).rejects.toThrow(ProviderError);

			try {
				await provider.process_content('not-a-url');
			} catch (error) {
				expect(error).toBeInstanceOf(ProviderError);
				expect((error as ProviderError).type).toBe(ErrorType.INVALID_INPUT);
			}
		});

		it('should handle empty URL array', async () => {
			await expect(provider.process_content([])).rejects.toThrow(ProviderError);
		});
	});

	describe('provider metadata', () => {
		it('should have correct name and description', () => {
			expect(provider.name).toBe('jina_reader');
			expect(provider.description).toContain('Jina AI Reader');
		});
	});
});