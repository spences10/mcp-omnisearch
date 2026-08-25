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

describe('TavilyExtractProvider', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.stubEnv('TAVILY_API_KEY', 'test-tavily-key');
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		vi.restoreAllMocks();
	});

	it('passes query, chunk count, and text format to Tavily', async () => {
		const fetch_mock = vi.fn(
			async (_input: RequestInfo | URL, _init?: RequestInit) =>
				json_response({
					results: [
						{
							url: 'https://example.com',
							raw_content: 'Focused text',
							favicon: 'https://example.com/favicon.ico',
						},
					],
					failed_results: [],
					response_time: 0.1,
					request_id: 'extract-request',
					usage: { credits: 2 },
				}),
		);
		vi.stubGlobal('fetch', fetch_mock);
		const { TavilyExtractProvider } = await import('./index.js');

		const result = await new TavilyExtractProvider().process_content(
			'https://example.com',
			'advanced',
			{
				query: 'installation requirements',
				chunks_per_source: 4,
				format: 'text',
			},
		);

		expect(result.metadata).toMatchObject({
			request_id: 'extract-request',
			response_time: 0.1,
			usage: { credits: 2 },
			favicons: {
				'https://example.com': 'https://example.com/favicon.ico',
			},
		});

		const request = fetch_mock.mock.calls[0]?.[1];
		expect(request).toBeDefined();
		if (!request) throw new Error('Expected Tavily extract request');
		expect(JSON.parse(request.body as string)).toEqual({
			urls: ['https://example.com'],
			include_images: false,
			include_favicon: true,
			include_usage: true,
			extract_depth: 'advanced',
			format: 'text',
			query: 'installation requirements',
			chunks_per_source: 4,
		});
	});

	it('rejects chunks_per_source without a query', async () => {
		const { TavilyExtractProvider } = await import('./index.js');

		await expect(
			new TavilyExtractProvider().process_content(
				'https://example.com',
				'basic',
				{ chunks_per_source: 2 },
			),
		).rejects.toMatchObject({
			type: 'INVALID_INPUT',
			provider: 'tavily_extract',
		});
	});

	it('combines extracted content and reports failed URLs', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () =>
				json_response({
					results: [
						{
							url: 'https://ok.test',
							raw_content: 'Extracted words here',
						},
					],
					failed_results: [
						{ url: 'https://bad.test', error: 'failed' },
					],
					response_time: 0.1,
				}),
			),
		);
		const { TavilyExtractProvider } = await import('./index.js');

		await expect(
			new TavilyExtractProvider().process_content([
				'https://ok.test',
				'https://bad.test',
			]),
		).resolves.toMatchObject({
			content: 'Extracted words here',
			raw_contents: [
				{ url: 'https://ok.test', content: 'Extracted words here' },
			],
			metadata: {
				failed_urls: ['https://bad.test'],
				urls_processed: 2,
				successful_extractions: 1,
			},
			source_provider: 'tavily_extract',
		});
	});
});
