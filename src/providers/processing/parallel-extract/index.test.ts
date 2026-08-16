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

describe('ParallelExtractProvider', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.stubEnv('PARALLEL_API_KEY', 'test-parallel-key');
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.unstubAllEnvs();
		vi.restoreAllMocks();
	});

	it('combines excerpts and reports failed URLs', async () => {
		const fetch = vi.fn(
			async (_input: RequestInfo | URL, _init?: RequestInit) =>
				json_response({
					extract_id: 'extract_1',
					session_id: 'session_1',
					results: [
						{
							url: 'https://ok.test',
							title: 'OK',
							excerpts: ['Extracted words here'],
						},
					],
					errors: [{ url: 'https://bad.test' }],
				}),
		);
		vi.stubGlobal('fetch', fetch);
		const { ParallelExtractProvider } = await import('./index.js');

		await expect(
			new ParallelExtractProvider().process_content([
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
			source_provider: 'parallel_extract',
		});

		expect(fetch).toHaveBeenCalledWith(
			'https://api.parallel.ai/v1/extract',
			expect.objectContaining({
				method: 'POST',
				headers: expect.objectContaining({
					'x-api-key': 'test-parallel-key',
				}),
			}),
		);
		expect(
			JSON.parse(fetch.mock.calls[0]?.[1]?.body as string),
		).toEqual({
			urls: ['https://ok.test', 'https://bad.test'],
			advanced_settings: { full_content: false },
		});
	});
});
