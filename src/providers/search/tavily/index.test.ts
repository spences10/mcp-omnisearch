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

describe('TavilySearchProvider', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.stubEnv('TAVILY_API_KEY', 'test-tavily-key');
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.unstubAllEnvs();
		vi.restoreAllMocks();
	});

	it('maps results when Tavily returns numeric response_time metadata', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () =>
				json_response({
					query: 'example domain',
					results: [
						{
							title: 'Example Domains',
							url: 'https://www.iana.org/help/example-domains',
							content: 'Reserved example domains.',
							score: 0.99986553,
						},
					],
					response_time: 0.57,
					request_id: '77d06e01-a9a1-4968-8fc3-5889dd2b61e9',
				}),
			),
		);
		const { TavilySearchProvider } = await import('./index.js');

		await expect(
			new TavilySearchProvider().search({
				query: 'example domain',
				limit: 1,
			}),
		).resolves.toEqual([
			{
				title: 'Example Domains',
				url: 'https://www.iana.org/help/example-domains',
				snippet: 'Reserved example domains.',
				score: 0.99986553,
				source_provider: 'tavily',
			},
		]);
	});

	it('normalizes date and country operators for Tavily API fields', async () => {
		const fetch = vi.fn(
			async (_input: RequestInfo | URL, _init?: RequestInit) =>
				json_response({
					results: [
						{
							title: 'Result',
							url: 'https://example.com',
							content: 'Content',
							score: 0.5,
						},
					],
					response_time: 0.2,
				}),
		);
		vi.stubGlobal('fetch', fetch);
		const { TavilySearchProvider } = await import('./index.js');

		await new TavilySearchProvider().search({
			query:
				'example after:2024-05 before:2024-05-10 loc:United-Kingdom',
			limit: 1,
		});

		const request_init = fetch.mock.calls[0]?.[1];
		expect(JSON.parse(request_init?.body as string)).toMatchObject({
			start_date: '2024-05-01',
			end_date: '2024-05-10',
			country: 'united kingdom',
		});
	});
});
