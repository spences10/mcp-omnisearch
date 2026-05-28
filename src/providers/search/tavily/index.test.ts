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
});
