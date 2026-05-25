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

describe('FirecrawlMapProvider', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.stubEnv('FIRECRAWL_API_KEY', 'test-firecrawl-key');
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		vi.restoreAllMocks();
	});

	it('formats discovered links as a site map', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () =>
				json_response({
					success: true,
					links: [
						{ url: 'https://site.test/a', title: 'A' },
						{ url: 'https://site.test/b' },
					],
				}),
			),
		);
		const { FirecrawlMapProvider } = await import('./index.js');

		const result = await new FirecrawlMapProvider().process_content(
			'https://site.test',
			'advanced',
		);

		expect(result).toMatchObject({
			content: expect.stringContaining('- https://site.test/a — A'),
			raw_contents: [
				{ url: 'https://site.test', content: result.content },
			],
			metadata: {
				word_count: 2,
				urls_processed: 1,
				successful_extractions: 1,
				extract_depth: 'advanced',
			},
			source_provider: 'firecrawl_map',
		});
	});
});
