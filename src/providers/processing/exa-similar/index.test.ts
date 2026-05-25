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

describe('ExaSimilarProvider', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.stubEnv('EXA_API_KEY', 'test-exa-key');
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		vi.restoreAllMocks();
	});

	it('finds similar pages for a URL', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () =>
				json_response({
					requestId: 'req-1',
					results: [
						{
							id: 'id-1',
							title: 'Similar',
							url: 'https://similar.test',
							text: 'Similar page text',
							score: 0.91,
						},
					],
				}),
			),
		);
		const { ExaSimilarProvider } = await import('./index.js');

		const result = await new ExaSimilarProvider().process_content(
			'https://example.com',
		);

		expect(result).toMatchObject({
			content: expect.stringContaining('Similar page text'),
			raw_contents: [
				{ url: 'https://similar.test', content: 'Similar page text' },
			],
			metadata: { successful_extractions: 1, extract_depth: 'basic' },
			source_provider: 'exa_similar',
		});
	});
});
