import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from 'vitest';

const json_response = (body: unknown) =>
	new Response(JSON.stringify(body), { status: 200 });

describe('FirecrawlCrawlProvider', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.stubEnv('FIRECRAWL_API_KEY', 'test-firecrawl-key');
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllEnvs();
		vi.restoreAllMocks();
	});

	it('polls a crawl job and aggregates successful pages', async () => {
		vi.stubGlobal(
			'fetch',
			vi
				.fn()
				.mockResolvedValueOnce(
					json_response({
						success: true,
						id: 'job-1',
						url: 'https://site.test',
					}),
				)
				.mockResolvedValueOnce(
					json_response({
						success: true,
						id: 'job-1',
						status: 'completed',
						data: [
							{
								url: 'https://site.test/a',
								markdown: 'Page A content',
								metadata: { title: 'A' },
							},
							{ url: 'https://site.test/b', error: 'failed' },
						],
					}),
				),
		);
		const { FirecrawlCrawlProvider } = await import('./index.js');

		const pending = new FirecrawlCrawlProvider().process_content(
			'https://site.test',
		);
		await vi.advanceTimersByTimeAsync(5000);
		const result = await pending;

		expect(result).toMatchObject({
			content: expect.stringContaining('Page A content'),
			raw_contents: [
				{ url: 'https://site.test/a', content: 'Page A content' },
			],
			metadata: {
				title: 'A',
				failed_urls: ['https://site.test/b'],
				urls_processed: 2,
				successful_extractions: 1,
			},
			source_provider: 'firecrawl_crawl',
		});
	});
});
