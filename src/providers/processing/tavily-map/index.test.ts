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

describe('TavilyMapProvider', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.stubEnv('TAVILY_API_KEY', 'test-tavily-key');
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		vi.restoreAllMocks();
	});

	it('maps discovered URLs and uses advanced traversal limits', async () => {
		const fetch_mock = vi.fn(
			async (_input: RequestInfo | URL, _init?: RequestInit) =>
				json_response({
					base_url: 'example.com',
					results: [
						'https://example.com',
						'https://example.com/docs',
					],
					response_time: 0.1,
				}),
		);
		vi.stubGlobal('fetch', fetch_mock);
		const { TavilyMapProvider } = await import('./index.js');

		await expect(
			new TavilyMapProvider().process_content(
				'https://example.com',
				'advanced',
			),
		).resolves.toMatchObject({
			content: expect.stringContaining('https://example.com/docs'),
			metadata: {
				urls_processed: 1,
				successful_extractions: 2,
				extract_depth: 'advanced',
			},
			source_provider: 'tavily_map',
		});

		const request = fetch_mock.mock.calls[0]?.[1];
		expect(request).toBeDefined();
		if (!request) throw new Error('Expected Tavily map request');
		expect(JSON.parse(request.body as string)).toMatchObject({
			url: 'https://example.com',
			max_depth: 3,
			max_breadth: 50,
			limit: 200,
		});
	});
});
