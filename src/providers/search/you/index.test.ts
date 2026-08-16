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

describe('YouSearchProvider', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.stubEnv('YOU_API_KEY', 'test-you-key');
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.unstubAllEnvs();
		vi.restoreAllMocks();
	});

	it('maps web and news results and sends domain filters', async () => {
		const fetch = vi.fn(
			async (_input: RequestInfo | URL, _init?: RequestInit) =>
				json_response({
					results: {
						web: [
							{
								title: 'Web result',
								url: 'https://example.com',
								description: 'Web summary',
							},
						],
						news: [
							{
								url: 'https://news.example.com',
								snippets: ['News snippet'],
							},
						],
					},
				}),
		);
		vi.stubGlobal('fetch', fetch);
		const { YouSearchProvider } = await import('./index.js');

		await expect(
			new YouSearchProvider().search({
				query: 'example site:docs.example.com -site:ads.example.com',
				limit: 5,
				include_domains: ['included.example.com'],
			}),
		).resolves.toEqual([
			{
				title: 'Web result',
				url: 'https://example.com',
				snippet: 'Web summary',
				source_provider: 'you',
			},
			{
				title: 'https://news.example.com',
				url: 'https://news.example.com',
				snippet: 'News snippet',
				source_provider: 'you',
			},
		]);

		expect(fetch).toHaveBeenCalledWith(
			'https://ydc-index.io/v1/search',
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
			query: 'example',
			count: 5,
			include_domains: ['included.example.com', 'docs.example.com'],
			exclude_domains: ['ads.example.com'],
		});
	});

	it('maps language, country, and date operators to You.com fields', async () => {
		const fetch = vi.fn(
			async (_input: RequestInfo | URL, _init?: RequestInit) =>
				json_response({
					results: [],
				}),
		);
		vi.stubGlobal('fetch', fetch);
		const { YouSearchProvider } = await import('./index.js');

		await new YouSearchProvider().search({
			query:
				'example lang:en loc:uk after:2024-05-01 before:2024-05-10',
			limit: 3,
		});

		expect(
			JSON.parse(fetch.mock.calls[0]?.[1]?.body as string),
		).toEqual({
			query: 'example',
			count: 3,
			country: 'GB',
			language: 'EN',
			freshness: '2024-05-01to2024-05-10',
		});
	});

	it('returns no results when the results block is omitted', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => json_response({})),
		);
		const { YouSearchProvider } = await import('./index.js');

		await expect(
			new YouSearchProvider().search({ query: 'empty' }),
		).resolves.toEqual([]);
	});
});
