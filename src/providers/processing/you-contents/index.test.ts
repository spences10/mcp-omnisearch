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

describe('YouContentsProvider', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.stubEnv('YOU_API_KEY', 'test-you-key');
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.unstubAllEnvs();
		vi.restoreAllMocks();
	});

	it('combines Markdown contents from the You.com Contents API', async () => {
		const fetch = vi.fn(
			async (_input: RequestInfo | URL, _init?: RequestInit) =>
				json_response([
					{
						url: 'https://ok.test',
						title: 'OK',
						markdown: 'Extracted words here',
					},
					{
						url: 'https://empty.test',
						markdown: '',
					},
				]),
		);
		vi.stubGlobal('fetch', fetch);
		const { YouContentsProvider } = await import('./index.js');

		await expect(
			new YouContentsProvider().process_content([
				'https://ok.test',
				'https://empty.test',
			]),
		).resolves.toMatchObject({
			content: 'Extracted words here',
			raw_contents: [
				{ url: 'https://ok.test', content: 'Extracted words here' },
			],
			metadata: {
				title: 'OK',
				urls_processed: 2,
				successful_extractions: 1,
				extract_depth: 'basic',
			},
			source_provider: 'you_contents',
		});

		expect(fetch).toHaveBeenCalledWith(
			'https://ydc-index.io/v1/contents',
			expect.objectContaining({
				method: 'POST',
				headers: expect.objectContaining({
					'X-API-Key': 'test-you-key',
				}),
			}),
		);
		expect(
			JSON.parse(fetch.mock.calls[0]?.[1]?.body as string),
		).toEqual({
			urls: ['https://ok.test', 'https://empty.test'],
			formats: ['markdown'],
		});
	});
});
