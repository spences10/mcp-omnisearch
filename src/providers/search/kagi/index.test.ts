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

	it('skips non-result rows and accepts omitted snippets and total_hits', async () => {
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
							snippet: null,
							rank: 2,
						},
						{
							title: 'With snippet',
							url: 'https://snippet.example',
							snippet: 'OK',
							rank: 3,
						},
					],
					meta: {},
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
				score: undefined,
				source_provider: 'kagi',
			},
			{
				title: 'Also good',
				url: 'https://example.org',
				snippet: '',
				score: 2,
				source_provider: 'kagi',
			},
			{
				title: 'With snippet',
				url: 'https://snippet.example',
				snippet: 'OK',
				score: 3,
				source_provider: 'kagi',
			},
		]);
	});
});
