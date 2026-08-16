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

	it('maps freshness to the Brave query param and keeps after: operators', async () => {
		const fetch = vi.fn(
			async (_input: RequestInfo | URL, _init?: RequestInit) =>
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

		const results = await new BraveSearchProvider().search({
			query: 'result after:2023',
			freshness: 'week',
			limit: 1,
		});
		const request_url = fetch.mock.calls[0]?.[0];
		expect(typeof request_url).toBe('string');
		const url = new URL(request_url as string);

		expect(url.searchParams.get('freshness')).toBe('pw');
		expect(url.searchParams.get('q')).toContain('after:2023');
		expect(results[0]?.metadata?.freshness).toEqual({
			requested: 'week',
			applied: true,
		});
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
