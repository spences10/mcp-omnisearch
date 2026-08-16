import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from 'vitest';

const json_response = (body: unknown) =>
	new Response(JSON.stringify(body), {
		status: 200,
		headers: { 'content-type': 'application/json' },
	});

describe('ParallelSearchProvider', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.stubEnv('PARALLEL_API_KEY', 'test-parallel-key');
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.unstubAllEnvs();
		vi.restoreAllMocks();
	});

	it('maps excerpts and sends basic-mode source policy', async () => {
		const fetch = vi.fn(
			async (_input: RequestInfo | URL, _init?: RequestInit) =>
				json_response({
					search_id: 'search_1',
					session_id: 'session_1',
					results: [
						{
							title: 'Result',
							url: 'https://example.com',
							excerpts: ['First excerpt', 'Second excerpt'],
							publish_date: '2024-01-15',
						},
					],
				}),
		);
		vi.stubGlobal('fetch', fetch);
		const { ParallelSearchProvider } = await import('./index.js');

		await expect(
			new ParallelSearchProvider().search({
				query: 'example site:docs.example.com',
				limit: 1,
				exclude_domains: ['ads.example.com'],
			}),
		).resolves.toEqual([
			{
				title: 'Result',
				url: 'https://example.com',
				snippet: 'First excerpt\n\nSecond excerpt',
				source_provider: 'parallel',
				metadata: { date: '2024-01-15' },
			},
		]);

		expect(fetch).toHaveBeenCalledWith(
			'https://api.parallel.ai/v1/search',
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
			objective: 'example',
			search_queries: ['example'],
			mode: 'basic',
			advanced_settings: {
				source_policy: {
					include_domains: ['docs.example.com'],
					exclude_domains: ['ads.example.com'],
				},
			},
		});
	});
});
