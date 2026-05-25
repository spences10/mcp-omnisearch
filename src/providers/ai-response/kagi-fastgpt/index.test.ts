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

describe('KagiFastGPTProvider', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.stubEnv('KAGI_API_KEY', 'test-kagi-key');
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		vi.restoreAllMocks();
	});

	it('maps the generated answer and applies result limits', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () =>
				json_response({
					meta: { id: 'id', node: 'node', ms: 12 },
					data: {
						output: 'Fast answer',
						tokens: 10,
						references: [
							{
								title: 'Ref',
								url: 'https://ref.test',
								snippet: 'Ref text',
							},
						],
					},
				}),
			),
		);
		const { KagiFastGPTProvider } = await import('./index.js');

		await expect(
			new KagiFastGPTProvider().search({ query: 'fast', limit: 1 }),
		).resolves.toEqual([
			{
				title: 'Kagi FastGPT Response',
				url: 'https://kagi.com/fastgpt',
				snippet: 'Fast answer',
				source_provider: 'kagi_fastgpt',
			},
		]);
	});
});
