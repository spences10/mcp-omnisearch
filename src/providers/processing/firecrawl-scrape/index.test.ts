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

describe('FirecrawlScrapeProvider', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.stubEnv('FIRECRAWL_API_KEY', 'test-firecrawl-key');
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		vi.restoreAllMocks();
	});

	it('scrapes multiple URLs and aggregates failures', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => undefined);
		vi.stubGlobal(
			'fetch',
			vi
				.fn()
				.mockResolvedValueOnce(
					json_response({
						success: true,
						data: {
							markdown: 'Scraped content',
							metadata: { title: 'Page' },
						},
					}),
				)
				.mockResolvedValueOnce(
					json_response({ success: false, error: 'blocked' }),
				),
		);
		const { FirecrawlScrapeProvider } = await import('./index.js');

		const result =
			await new FirecrawlScrapeProvider().process_content([
				'https://ok.test',
				'https://bad.test',
			]);

		expect(result).toMatchObject({
			content: expect.stringContaining('Scraped content'),
			raw_contents: [
				{ url: 'https://ok.test', content: 'Scraped content' },
			],
			metadata: {
				failed_urls: ['https://bad.test'],
				urls_processed: 2,
				successful_extractions: 1,
			},
			source_provider: 'firecrawl_scrape',
		});
	});
});
