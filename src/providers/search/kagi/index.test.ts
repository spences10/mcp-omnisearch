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
		vi.useRealTimers();
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

	it('maps freshness to Kagi time_range and keeps before:/after: operators', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-08-16T12:00:00.000Z'));
		const fetch = vi.fn(
			async (_input: RequestInfo | URL, _init?: RequestInit) =>
				json_response({
					data: [{ title: 'Good', url: 'https://example.com' }],
				}),
		);
		vi.stubGlobal('fetch', fetch);
		const { KagiSearchProvider } = await import('./index.js');

		const results = await new KagiSearchProvider().search({
			query: 'mixed rows after:2023 before:2024',
			freshness: 'week',
			limit: 10,
		});
		const request_url = fetch.mock.calls[0]?.[0];
		expect(typeof request_url).toBe('string');
		const url = new URL(request_url as string);

		expect(url.searchParams.get('time_range')).toBe(
			'after:2026-08-09,before:2024',
		);
		expect(results[0]?.metadata?.freshness).toEqual({
			requested: 'week',
			applied: true,
		});
	});
});
