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

describe('TinyFishSearchProvider', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.stubEnv('TINYFISH_API_KEY', 'test-tinyfish-key');
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.unstubAllEnvs();
		vi.restoreAllMocks();
	});

	it('maps results and sends domain and date filters', async () => {
		const fetch = vi.fn(
			async (_input: RequestInfo | URL, _init?: RequestInit) =>
				json_response({
					query: 'example',
					results: [
						{
							title: 'Result',
							url: 'https://example.com',
							snippet: 'Summary',
							site_name: 'example.com',
						},
					],
				}),
		);
		vi.stubGlobal('fetch', fetch);
		const { TinyFishSearchProvider } = await import('./index.js');

		await expect(
			new TinyFishSearchProvider().search({
				query:
					'example site:docs.example.com lang:en loc:US after:2024-05-01 before:2024-05-10',
				limit: 1,
				exclude_domains: ['ads.example.com'],
			}),
		).resolves.toEqual([
			{
				title: 'Result',
				url: 'https://example.com',
				snippet: 'Summary',
				source_provider: 'tinyfish',
				metadata: { site_name: 'example.com' },
			},
		]);

		const requested = new URL(String(fetch.mock.calls[0]?.[0]));
		expect(requested.origin + requested.pathname).toBe(
			'https://api.search.tinyfish.ai/',
		);
		expect(requested.searchParams.get('query')).toBe('example');
		expect(requested.searchParams.get('domain_type')).toBe('web');
		expect(requested.searchParams.get('include_domains')).toBe(
			'docs.example.com',
		);
		expect(requested.searchParams.get('exclude_domains')).toBe(
			'ads.example.com',
		);
		expect(requested.searchParams.get('language')).toBe('en');
		expect(requested.searchParams.get('location')).toBe('US');
		expect(requested.searchParams.get('after_date')).toBe(
			'2024-05-01',
		);
		expect(requested.searchParams.get('before_date')).toBe(
			'2024-05-10',
		);
		expect(fetch.mock.calls[0]?.[1]).toEqual(
			expect.objectContaining({
				method: 'GET',
				headers: expect.objectContaining({
					'X-API-Key': 'test-tinyfish-key',
				}),
			}),
		);
	});
});
