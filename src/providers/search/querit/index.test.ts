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

describe('QueritSearchProvider', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.stubEnv('QUERIT_API_KEY', 'test-querit-key');
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.unstubAllEnvs();
		vi.restoreAllMocks();
	});

	it('maps results and translates multilingual filters', async () => {
		const fetch = vi.fn(
			async (_input: RequestInfo | URL, _init?: RequestInit) =>
				json_response({
					error_code: 200,
					error_msg: 'ok',
					results: {
						result: [
							{
								title: 'Result',
								url: 'https://example.com',
								snippet: 'Summary',
								page_age: '1 day ago',
								site_name: 'Example',
							},
						],
					},
				}),
		);
		vi.stubGlobal('fetch', fetch);
		const { QueritSearchProvider } = await import('./index.js');

		await expect(
			new QueritSearchProvider().search({
				query:
					'noticias lang:es loc:es site:elpais.com after:2024-05-01 before:2024-05-10',
				limit: 5,
			}),
		).resolves.toEqual([
			{
				title: 'Result',
				url: 'https://example.com',
				snippet: 'Summary',
				source_provider: 'querit',
				metadata: { date: '1 day ago', site_name: 'Example' },
			},
		]);

		expect(fetch).toHaveBeenCalledWith(
			'https://api.querit.ai/v1/search',
			expect.objectContaining({
				method: 'POST',
				headers: expect.objectContaining({
					Authorization: 'Bearer test-querit-key',
				}),
			}),
		);
		expect(
			JSON.parse(fetch.mock.calls[0]?.[1]?.body as string),
		).toEqual({
			query: 'noticias',
			count: 5,
			filters: {
				sites: { include: ['elpais.com'] },
				languages: { include: ['spanish'] },
				geo: { countries: { include: ['spain'] } },
				timeRange: { date: '2024-05-01to2024-05-10' },
			},
		});
	});

	it('treats error_code 200 as success and other codes as errors', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () =>
				json_response({
					error_code: 429,
					error_msg: 'too many requests',
					results: { result: [] },
				}),
			),
		);
		const { QueritSearchProvider } = await import('./index.js');

		await expect(
			new QueritSearchProvider().search({ query: 'busy' }),
		).rejects.toMatchObject({
			message: 'too many requests',
			provider: 'querit',
		});
	});
});
