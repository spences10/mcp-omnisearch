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
