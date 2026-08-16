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

describe('KeenableExtractProvider', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.stubEnv('KEENABLE_API_KEY', 'test-keenable-key');
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.unstubAllEnvs();
		vi.restoreAllMocks();
	});

	it('fetches Markdown from the keyed endpoint', async () => {
		const fetch = vi.fn(
			async (_input: RequestInfo | URL, _init?: RequestInit) =>
				json_response({
					url: 'https://ok.test',
					title: 'OK',
					content: 'Extracted words here',
					author: 'Ada',
				}),
		);
		vi.stubGlobal('fetch', fetch);
		const { KeenableExtractProvider } = await import('./index.js');

		await expect(
			new KeenableExtractProvider().process_content(
				'https://ok.test',
			),
		).resolves.toMatchObject({
			content: 'Extracted words here',
			raw_contents: [
				{ url: 'https://ok.test', content: 'Extracted words here' },
			],
			metadata: {
				title: 'OK',
				author: 'Ada',
				urls_processed: 1,
				successful_extractions: 1,
			},
			source_provider: 'keenable_extract',
		});

		expect(fetch).toHaveBeenCalledWith(
			'https://api.keenable.ai/v1/fetch?url=https%3A%2F%2Fok.test',
			expect.objectContaining({
				method: 'GET',
				headers: expect.objectContaining({
					'X-API-Key': 'test-keenable-key',
				}),
			}),
		);
	});
});
