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

describe('KagiEnrichmentSearchProvider', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.stubEnv('KAGI_API_KEY', 'test-kagi-key');
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		vi.restoreAllMocks();
	});

	it('combines web and news enrichment results and decodes snippets', async () => {
		vi.stubGlobal(
			'fetch',
			vi
				.fn()
				.mockResolvedValueOnce(
					json_response({
						data: [
							{
								title: 'Web',
								url: 'https://web.test',
								snippet: 'Tom &amp; Jerry',
								rank: 2,
							},
							{ t: 1, list: ['related'] },
						],
					}),
				)
				.mockResolvedValueOnce(
					json_response({
						data: [
							{
								title: 'News',
								url: 'https://news.test',
								snippet: null,
							},
						],
					}),
				),
		);
		const { KagiEnrichmentSearchProvider } =
			await import('./index.js');

		await expect(
			new KagiEnrichmentSearchProvider().search({
				query: 'kagi',
				limit: 1,
			}),
		).resolves.toEqual([
			{
				title: 'Web',
				url: 'https://web.test',
				snippet: 'Tom & Jerry',
				score: 0.5,
				source_provider: 'kagi_enrichment',
			},
			{
				title: 'News',
				url: 'https://news.test',
				snippet: '',
				score: undefined,
				source_provider: 'kagi_enrichment',
			},
		]);
	});

	it('uses only the news enrichment endpoint when search_type is news', async () => {
		const fetch = vi.fn(
			async (_input: RequestInfo | URL, _init?: RequestInit) =>
				json_response({
					data: [
						{
							title: 'News',
							url: 'https://news.test',
							snippet: 'Today',
							rank: 1,
						},
					],
				}),
		);
		vi.stubGlobal('fetch', fetch);
		const { KagiEnrichmentSearchProvider } =
			await import('./index.js');

		await expect(
			new KagiEnrichmentSearchProvider().search({
				query: 'svelte release',
				limit: 2,
				search_type: 'news',
			}),
		).resolves.toEqual([
			{
				title: 'News',
				url: 'https://news.test',
				snippet: 'Today',
				score: 1,
				source_provider: 'kagi_enrichment',
			},
		]);
		expect(fetch).toHaveBeenCalledTimes(1);
		const called_url = fetch.mock.calls[0]?.[0] as string;
		expect(called_url).toContain('/enrich/news?');
		expect(called_url).toContain('limit=2');
	});
});
