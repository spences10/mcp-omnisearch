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

describe('FirecrawlActionsProvider', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.stubEnv('FIRECRAWL_API_KEY', 'test-firecrawl-key');
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		vi.restoreAllMocks();
	});

	it('performs advanced actions before extraction', async () => {
		const fetch = vi.fn(
			async (_input: RequestInfo | URL, _init?: RequestInit) =>
				json_response({
					success: true,
					data: {
						markdown: 'Loaded content',
						screenshot: 'shot.png',
					},
				}),
		);
		vi.stubGlobal('fetch', fetch);
		const { FirecrawlActionsProvider } = await import('./index.js');

		const result =
			await new FirecrawlActionsProvider().process_content(
				'https://dynamic.test',
				'advanced',
			);

		expect(result).toMatchObject({
			content: expect.stringContaining('Loaded content'),
			raw_contents: [
				{ url: 'https://dynamic.test', content: result.content },
			],
			metadata: { screenshot: 'shot.png', extract_depth: 'advanced' },
			source_provider: 'firecrawl_actions',
		});
		const request_init = fetch.mock.calls[0]?.[1];
		expect(JSON.parse(request_init?.body as string)).toMatchObject({
			url: 'https://dynamic.test',
			formats: ['markdown', 'screenshot'],
		});
		expect(
			JSON.parse(request_init?.body as string).actions,
		).toHaveLength(7);
	});
});
