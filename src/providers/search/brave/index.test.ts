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
