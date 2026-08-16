import { afterEach, describe, expect, it, vi } from 'vitest';

const json_response = (body: unknown) =>
	new Response(JSON.stringify(body), {
		status: 200,
		headers: { 'content-type': 'application/json' },
	});

describe('KeenableSearchProvider', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.unstubAllEnvs();
		vi.restoreAllMocks();
	});

	it('maps results and uses the keyed search endpoint', async () => {
		vi.resetModules();
		vi.stubEnv('KEENABLE_API_KEY', 'test-keenable-key');
		const fetch = vi.fn(
			async (_input: RequestInfo | URL, _init?: RequestInit) =>
				json_response({
					query: 'example',
					results: [
						{
							title: 'Result',
							url: 'https://example.com',
							description: 'Summary',
							published_at: '2026-01-15T10:30:00Z',
						},
					],
				}),
		);
		vi.stubGlobal('fetch', fetch);
		const { KeenableSearchProvider } = await import('./index.js');

		await expect(
			new KeenableSearchProvider().search({
				query: 'example site:techcrunch.com after:2024-05-01',
				limit: 1,
			}),
		).resolves.toEqual([
			{
				title: 'Result',
				url: 'https://example.com',
				snippet: 'Summary',
				source_provider: 'keenable',
				metadata: { date: '2026-01-15T10:30:00Z' },
			},
		]);

		expect(fetch).toHaveBeenCalledWith(
			'https://api.keenable.ai/v1/search',
			expect.objectContaining({
				method: 'POST',
				headers: expect.objectContaining({
					'X-API-Key': 'test-keenable-key',
				}),
			}),
		);
		expect(
			JSON.parse(fetch.mock.calls[0]?.[1]?.body as string),
		).toEqual({
			query: 'example',
			site: 'techcrunch.com',
			published_after: '2024-05-01',
		});
	});

	it('uses the public search endpoint when only the public tier is opted in', async () => {
		vi.resetModules();
		vi.stubEnv('KEENABLE_ALLOW_PUBLIC', '1');
		const fetch = vi.fn(
			async (_input: RequestInfo | URL, _init?: RequestInit) =>
				json_response({ results: [] }),
		);
		vi.stubGlobal('fetch', fetch);
		const { KeenableSearchProvider } = await import('./index.js');

		await new KeenableSearchProvider().search({ query: 'public' });

		expect(fetch).toHaveBeenCalledWith(
			'https://api.keenable.ai/v1/search/public',
			expect.objectContaining({
				method: 'POST',
				headers: expect.not.objectContaining({
					'X-API-Key': expect.anything(),
				}),
			}),
		);
	});
});
