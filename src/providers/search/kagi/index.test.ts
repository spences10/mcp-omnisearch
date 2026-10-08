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

describe('KagiSearchProvider', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.stubEnv('KAGI_API_KEY', 'test-kagi-key');
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		vi.restoreAllMocks();
	});

	it('posts the query to the v1 API with bearer auth', async () => {
		const fetch_mock = vi.fn(async () =>
			json_response({ meta: {}, data: { search: [] } }),
		);
		vi.stubGlobal('fetch', fetch_mock);
		const { KagiSearchProvider } = await import('./index.js');

		await new KagiSearchProvider().search({
			query: 'svelte',
			limit: 3,
			include_domains: ['svelte.dev'],
		});

		const [url, init] = fetch_mock.mock.calls[0] as unknown as [
			string,
			RequestInit,
		];

		expect(url).toBe('https://kagi.com/api/v1/search');
		expect(init.method).toBe('POST');
		expect(init.headers).toMatchObject({
			Authorization: 'Bearer test-kagi-key',
		});
		expect(JSON.parse(init.body as string)).toEqual({
			query: 'svelte site:svelte.dev',
			limit: 3,
		});
	});

	it('skips non-result rows, ignores other result types, and cleans snippets', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () =>
				json_response({
					meta: { trace: 'abc', node: 'us-central1', ms: 12 },
					data: {
						search: [
							{ title: 'Good', url: 'https://example.com' },
							{ t: 0 },
							{
								title: 'Also good',
								url: 'https://example.org',
								snippet: null,
							},
							{
								title: 'With snippet',
								url: 'https://snippet.example',
								snippet:
									'<strong>Svelte</strong> &amp; SvelteKit&#39;s &quot;guide&quot;',
							},
						],
						infobox: [
							{ title: 'Infobox', url: 'https://wiki.example' },
						],
					},
				}),
			),
		);
		const { KagiSearchProvider } = await import('./index.js');

		await expect(
			new KagiSearchProvider().search({
				query: 'mixed rows',
				limit: 10,
			}),
		).resolves.toEqual([
			{
				title: 'Good',
				url: 'https://example.com',
				snippet: '',
				source_provider: 'kagi',
			},
			{
				title: 'Also good',
				url: 'https://example.org',
				snippet: '',
				source_provider: 'kagi',
			},
			{
				title: 'With snippet',
				url: 'https://snippet.example',
				snippet: 'Svelte & SvelteKit\'s "guide"',
				source_provider: 'kagi',
			},
		]);
	});

	it('returns no results when the response has no web results', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => json_response({ meta: {}, data: null })),
		);
		const { KagiSearchProvider } = await import('./index.js');

		await expect(
			new KagiSearchProvider().search({ query: 'nothing' }),
		).resolves.toEqual([]);
	});
});
