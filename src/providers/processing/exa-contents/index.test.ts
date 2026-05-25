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

describe('ExaContentsProvider', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.stubEnv('EXA_API_KEY', 'test-exa-key');
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		vi.restoreAllMocks();
	});

	it('extracts URL content and enables advanced fields', async () => {
		const fetch = vi.fn(
			async (_input: RequestInfo | URL, _init?: RequestInit) =>
				json_response({
					requestId: 'req-1',
					results: [
						{
							id: 'id-1',
							title: 'Page',
							url: 'https://example.com',
							text: 'Full page text',
							summary: 'Summary',
							highlights: ['Highlight'],
						},
					],
				}),
		);
		vi.stubGlobal('fetch', fetch);
		const { ExaContentsProvider } = await import('./index.js');

		const result = await new ExaContentsProvider().process_content(
			'https://example.com',
			'advanced',
		);

		expect(result).toMatchObject({
			content: expect.stringContaining('Full page text'),
			raw_contents: [
				{ url: 'https://example.com', content: 'Full page text' },
			],
			metadata: {
				successful_extractions: 1,
				extract_depth: 'advanced',
			},
			source_provider: 'exa_contents',
		});
		const request_init = fetch.mock.calls[0]?.[1];
		expect(JSON.parse(request_init?.body as string)).toMatchObject({
			urls: ['https://example.com'],
			highlights: true,
			summary: true,
		});
	});
});
