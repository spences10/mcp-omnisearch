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

describe('BraveSearchProvider', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.stubEnv('BRAVE_API_KEY', 'test-brave-key');
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		vi.restoreAllMocks();
	});

	it('maps web results', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () =>
				json_response({
					web: {
						results: [
							{
								title: 'Result',
								url: 'https://example.com',
								description: 'Summary',
							},
						],
					},
				}),
			),
		);
		const { BraveSearchProvider } = await import('./index.js');

		await expect(
			new BraveSearchProvider().search({ query: 'result', limit: 1 }),
		).resolves.toEqual([
			{
				title: 'Result',
				url: 'https://example.com',
				snippet: 'Summary',
				source_provider: 'brave',
			},
		]);
	});

	it('sends country and search_lang without rewriting the query', async () => {
		const fetch = vi.fn(async (_input: string, _init?: RequestInit) =>
			json_response({
				web: {
					results: [
						{
							title: 'Result',
							url: 'https://example.com',
							description: 'Summary',
						},
					],
				},
			}),
		);
		vi.stubGlobal('fetch', fetch);
		const { BraveSearchProvider } = await import('./index.js');

		await new BraveSearchProvider().search({
			query: 'nachhaltige energie loc:us lang:en',
			limit: 1,
			country: 'at',
			language: 'de',
		});

		const request_url = String(fetch.mock.calls[0]?.[0]);
		const query_params = new URL(request_url).searchParams;
		expect(query_params.get('country')).toBe('AT');
		expect(query_params.get('search_lang')).toBe('de');
		expect(query_params.get('q')).toBe('nachhaltige energie');
	});

	it('returns no results when the web block is omitted', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => json_response({ type: 'search' })),
		);
		const { BraveSearchProvider } = await import('./index.js');

		await expect(
			new BraveSearchProvider().search({
				query: 'no results',
				limit: 10,
			}),
		).resolves.toEqual([]);
	});
});
