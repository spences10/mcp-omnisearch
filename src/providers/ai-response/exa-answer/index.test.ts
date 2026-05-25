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

describe('ExaAnswerProvider', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.stubEnv('EXA_API_KEY', 'test-exa-key');
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		vi.restoreAllMocks();
	});

	it('returns the answer followed by limited citations', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () =>
				json_response({
					answer: 'The answer',
					requestId: 'req-1',
					citations: [
						{
							id: '1',
							title: 'One',
							url: 'https://one.test',
							text: 'One text',
						},
						{ id: '2', title: 'Two', url: 'https://two.test' },
					],
				}),
			),
		);
		const { ExaAnswerProvider } = await import('./index.js');

		await expect(
			new ExaAnswerProvider().search({
				query: 'answer me',
				limit: 1,
			}),
		).resolves.toMatchObject([
			{
				title: 'AI Answer',
				snippet: 'The answer',
				source_provider: 'exa_answer',
			},
			{ title: 'One', url: 'https://one.test', snippet: 'One text' },
		]);
	});
});
