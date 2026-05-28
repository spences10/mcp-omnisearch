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
});
