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

describe('KagiSummarizerProvider', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.stubEnv('KAGI_API_KEY', 'test-kagi-key');
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		vi.restoreAllMocks();
	});

	it('summarizes a URL response', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () =>
				json_response({
					meta: { id: 'id', node: 'node', ms: 3 },
					data: { output: 'Summary text', tokens: 2 },
				}),
			),
		);
		const { KagiSummarizerProvider } = await import('./index.js');

		await expect(
			new KagiSummarizerProvider().process_content(
				'https://example.com',
			),
		).resolves.toEqual({
			content: 'Summary text',
			metadata: { word_count: 2 },
			source_provider: 'kagi_summarizer',
		});
	});
});
