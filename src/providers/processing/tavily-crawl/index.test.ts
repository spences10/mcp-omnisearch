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

describe('TavilyCrawlProvider', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.stubEnv('TAVILY_API_KEY', 'test-tavily-key');
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		vi.restoreAllMocks();
	});

	it('combines crawled pages and sends basic traversal limits', async () => {
		const fetch_mock = vi.fn(
			async (_input: RequestInfo | URL, _init?: RequestInit) =>
				json_response({
					base_url: 'example.com',
					results: [
						{
							url: 'https://example.com',
							raw_content: 'Home content',
						},
						{
							url: 'https://example.com/docs',
							raw_content: 'Docs content',
						},
					],
					response_time: 0.1,
				}),
		);
		vi.stubGlobal('fetch', fetch_mock);
		const { TavilyCrawlProvider } = await import('./index.js');

		await expect(
			new TavilyCrawlProvider().process_content(
				'https://example.com',
			),
		).resolves.toMatchObject({
			raw_contents: [
				{ url: 'https://example.com', content: 'Home content' },
				{
					url: 'https://example.com/docs',
					content: 'Docs content',
				},
			],
			metadata: {
				urls_processed: 2,
				successful_extractions: 2,
				extract_depth: 'basic',
			},
			source_provider: 'tavily_crawl',
		});

		const request = fetch_mock.mock.calls[0]?.[1];
		expect(request).toBeDefined();
		if (!request) throw new Error('Expected Tavily crawl request');
		expect(JSON.parse(request.body as string)).toMatchObject({
			url: 'https://example.com',
			max_depth: 1,
			max_breadth: 20,
			limit: 20,
			extract_depth: 'basic',
			format: 'markdown',
		});
	});
});
