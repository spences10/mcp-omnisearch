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
		const fetch = vi
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
					status: 'completed',
					total: 2,
					completed: 1,
					data: [
						{
							markdown: 'Page A content',
							html: null,
							metadata: {
								title: 'A',
								sourceURL: 'https://site.test/a',
							},
						},
						{
							metadata: {
								sourceURL: 'https://site.test/b',
								error: 'failed',
							},
						},
					],
				}),
			);
		vi.stubGlobal('fetch', fetch);
		const { FirecrawlCrawlProvider } = await import('./index.js');

		const pending = new FirecrawlCrawlProvider().process_content(
			'https://site.test',
		);
		await vi.advanceTimersByTimeAsync(5000);
		const result = await pending;

		expect(
			JSON.parse(fetch.mock.calls[0]?.[1]?.body as string),
		).toMatchObject({
			maxDiscoveryDepth: 1,
		});
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

	it('fails when crawl status returns no pages', async () => {
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
						status: 'completed',
						data: [],
					}),
				),
		);
		const { FirecrawlCrawlProvider } = await import('./index.js');

		const pending = new FirecrawlCrawlProvider().process_content(
			'https://site.test',
		);
		const expectation = expect(pending).rejects.toThrow(
			'Crawl returned no data',
		);
		await vi.advanceTimersByTimeAsync(5000);

		await expectation;
	});

	it('fails when all crawled pages have extraction errors', async () => {
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
						status: 'completed',
						data: [
							{
								markdown: 'Failed content',
								metadata: { error: 'blocked' },
							},
						],
					}),
				),
		);
		const { FirecrawlCrawlProvider } = await import('./index.js');

		const pending = new FirecrawlCrawlProvider().process_content(
			'https://site.test',
		);
		const expectation = expect(pending).rejects.toThrow(
			'All crawled pages failed to extract content',
		);
		await vi.advanceTimersByTimeAsync(5000);

		await expectation;
	});
});
