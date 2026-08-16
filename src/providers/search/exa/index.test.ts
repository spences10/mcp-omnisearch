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

describe('ExaSearchProvider', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.stubEnv('EXA_API_KEY', 'test-exa-key');
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllEnvs();
		vi.restoreAllMocks();
	});

	it('posts search options and maps results with metadata', async () => {
		const fetch = vi.fn(
			async (_input: RequestInfo | URL, _init?: RequestInit) =>
				json_response({
					requestId: 'req-1',
					autopromptString: 'auto query',
					searchType: 'neural',
					results: [
						{
							id: 'id-1',
							title: 'Exa result',
							url: 'https://example.com',
							text: 'Body text',
							score: 0.7,
							author: 'Author',
						},
					],
				}),
		);
		vi.stubGlobal('fetch', fetch);
		const { ExaSearchProvider } = await import('./index.js');

		await expect(
			new ExaSearchProvider().search({
				query: ' exa search ',
				limit: 1,
				include_domains: ['example.com'],
				exclude_domains: ['bad.example'],
			}),
		).resolves.toMatchObject([
			{
				title: 'Exa result',
				url: 'https://example.com',
				snippet: 'Body text',
				score: 0.7,
				source_provider: 'exa',
				metadata: { id: 'id-1', resolvedSearchType: 'neural' },
			},
		]);
		const request_init = fetch.mock.calls[0]?.[1];
		expect(JSON.parse(request_init?.body as string)).toMatchObject({
			query: 'exa search',
			numResults: 1,
			includeDomains: ['example.com'],
			excludeDomains: ['bad.example'],
		});
	});

	it('maps freshness to Exa startPublishedDate', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-08-16T12:00:00.000Z'));
		const fetch = vi.fn(
			async (_input: RequestInfo | URL, _init?: RequestInit) =>
				json_response({
					requestId: 'req-1',
					results: [
						{
							id: 'id-1',
							title: 'Exa result',
							url: 'https://example.com',
							text: 'Body text',
						},
					],
				}),
		);
		vi.stubGlobal('fetch', fetch);
		const { ExaSearchProvider } = await import('./index.js');

		const results = await new ExaSearchProvider().search({
			query: 'exa search',
			freshness: 'week',
			limit: 1,
		});
		const request_init = fetch.mock.calls[0]?.[1];
		expect(JSON.parse(request_init?.body as string)).toMatchObject({
			startPublishedDate: '2026-08-09T12:00:00.000Z',
		});
		expect(results[0]?.metadata?.freshness).toEqual({
			requested: 'week',
			applied: true,
		});
	});
});
