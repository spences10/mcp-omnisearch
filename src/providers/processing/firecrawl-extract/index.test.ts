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

describe('FirecrawlExtractProvider', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.stubEnv('FIRECRAWL_API_KEY', 'test-firecrawl-key');
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllEnvs();
		vi.restoreAllMocks();
	});

	it('polls an extract job and formats structured data', async () => {
		vi.stubGlobal(
			'fetch',
			vi
				.fn()
				.mockResolvedValueOnce(
					json_response({ success: true, id: 'job-1' }),
				)
				.mockResolvedValueOnce(
					json_response({
						success: true,
						id: 'job-1',
						status: 'completed',
						data: {
							title: 'Extracted title',
							tags: ['a', 'b'],
							author: { name: 'Author' },
						},
					}),
				),
		);
		const { FirecrawlExtractProvider } = await import('./index.js');

		const pending = new FirecrawlExtractProvider().process_content(
			'https://extract.test',
		);
		await vi.advanceTimersByTimeAsync(3000);
		const result = await pending;

		expect(result).toMatchObject({
			content: expect.stringContaining('Extracted title'),
			raw_contents: [
				{ url: 'https://extract.test', content: result.content },
			],
			metadata: {
				title: 'Extracted title',
				urls_processed: 1,
				successful_extractions: 1,
			},
			source_provider: 'firecrawl_extract',
		});
		expect(result.content).toContain('- a');
		expect(result.content).toContain('- **name**: Author');
	});
});
