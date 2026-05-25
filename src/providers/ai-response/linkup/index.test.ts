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

describe('LinkupProvider', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.stubEnv('LINKUP_API_KEY', 'test-linkup-key');
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		vi.restoreAllMocks();
	});

	it('posts domain filters and maps sourced answers', async () => {
		const fetch = vi.fn(
			async (_input: RequestInfo | URL, _init?: RequestInit) =>
				json_response({
					answer: 'Sourced answer',
					sources: [
						{
							favicon: 'https://source.test/favicon.ico',
							name: 'Source',
							snippet: 'Source snippet',
							url: 'https://source.test',
						},
					],
				}),
		);
		vi.stubGlobal('fetch', fetch);
		const { LinkupProvider } = await import('./index.js');

		await expect(
			new LinkupProvider().search({
				query: 'source',
				limit: 2,
				include_domains: ['source.test'],
			}),
		).resolves.toMatchObject([
			{ title: 'Linkup AI Answer', snippet: 'Sourced answer' },
			{
				title: 'Source',
				url: 'https://source.test',
				snippet: 'Source snippet',
			},
		]);
		const request_init = fetch.mock.calls[0]?.[1];
		expect(JSON.parse(request_init?.body as string)).toMatchObject({
			q: 'source',
			maxResults: 2,
			includeDomains: ['source.test'],
		});
	});
});
