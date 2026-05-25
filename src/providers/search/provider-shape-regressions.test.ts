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

describe('search provider response shape regressions', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.stubEnv('BRAVE_API_KEY', 'test-brave-key');
		vi.stubEnv('KAGI_API_KEY', 'test-kagi-key');
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		vi.restoreAllMocks();
	});

	it('returns no Brave results when the web block is omitted', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => json_response({ type: 'search' })),
		);
		const { BraveSearchProvider } = await import('./brave/index.js');

		await expect(
			new BraveSearchProvider().search({
				query: 'no results',
				limit: 10,
			}),
		).resolves.toEqual([]);
	});

	it('skips non-result Kagi rows and accepts omitted snippets and total_hits', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () =>
				json_response({
					data: [
						{ title: 'Good', url: 'https://example.com' },
						{ t: 0 },
						{
							title: 'Also good',
							url: 'https://example.org',
							snippet: 'OK',
							rank: 2,
						},
					],
					meta: {},
				}),
			),
		);
		const { KagiSearchProvider } = await import('./kagi/index.js');

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
				score: undefined,
				source_provider: 'kagi',
			},
			{
				title: 'Also good',
				url: 'https://example.org',
				snippet: 'OK',
				score: 2,
				source_provider: 'kagi',
			},
		]);
	});
});
