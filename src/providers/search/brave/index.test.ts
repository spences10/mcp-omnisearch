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

	it('uses the native news endpoint when search_type is news', async () => {
		const fetch = vi.fn(
			async (_input: RequestInfo | URL, _init?: RequestInit) =>
				json_response({
					type: 'news',
					results: [
						{
							title: 'Breaking',
							url: 'https://news.example',
							description: 'Today',
							age: '2 hours ago',
						},
					],
				}),
		);
		vi.stubGlobal('fetch', fetch);
		const { BraveSearchProvider } = await import('./index.js');

		await expect(
			new BraveSearchProvider().search({
				query: 'svelte release',
				limit: 3,
				search_type: 'news',
			}),
		).resolves.toEqual([
			{
				title: 'Breaking',
				url: 'https://news.example',
				snippet: 'Today',
				source_provider: 'brave',
				metadata: { age: '2 hours ago' },
			},
		]);
		const called_url = fetch.mock.calls[0]?.[0] as string;
		expect(called_url).toContain('/news/search?');
		expect(called_url).toContain('count=3');
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
