import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from 'vitest';

const json_response = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), { status });

describe('TavilyResearchProvider', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.stubEnv('TAVILY_API_KEY', 'test-tavily-key');
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		vi.restoreAllMocks();
	});

	it('creates a research task and returns its report with sources', async () => {
		const fetch_mock = vi
			.fn<
				(
					input: RequestInfo | URL,
					init?: RequestInit,
				) => Promise<Response>
			>()
			.mockResolvedValueOnce(
				json_response(
					{
						request_id: 'research-123',
						status: 'pending',
					},
					202,
				),
			)
			.mockResolvedValueOnce(
				json_response({
					request_id: 'research-123',
					status: 'completed',
					content: 'Completed research report',
					sources: [
						{
							title: 'Primary source',
							url: 'https://example.com/source',
							favicon: 'https://example.com/favicon.ico',
						},
					],
					response_time: 12.5,
				}),
			);
		vi.stubGlobal('fetch', fetch_mock);
		const { TavilyResearchProvider } = await import('./index.js');

		await expect(
			new TavilyResearchProvider().search({
				query: 'Research this topic',
				limit: 1,
			}),
		).resolves.toEqual([
			expect.objectContaining({
				title: 'Tavily Research Report',
				snippet: 'Completed research report',
				source_provider: 'tavily_research',
				metadata: expect.objectContaining({
					request_id: 'research-123',
					sources_count: 1,
				}),
			}),
			expect.objectContaining({
				title: 'Primary source',
				url: 'https://example.com/source',
			}),
		]);

		expect(fetch_mock).toHaveBeenCalledTimes(2);
		const create_request = fetch_mock.mock.calls[0]?.[1];
		expect(create_request).toBeDefined();
		if (!create_request) throw new Error('Expected research request');
		expect(JSON.parse(create_request.body as string)).toEqual({
			input: 'Research this topic',
			model: 'auto',
			stream: false,
			citation_format: 'numbered',
			output_length: 'standard',
		});
		expect(fetch_mock.mock.calls[1]?.[0]).toBe(
			'https://api.tavily.com/research/research-123',
		);
	});

	it('returns a provider error when the research task fails', async () => {
		vi.stubGlobal(
			'fetch',
			vi
				.fn()
				.mockResolvedValueOnce(
					json_response({
						request_id: 'failed-123',
						status: 'pending',
					}),
				)
				.mockResolvedValueOnce(
					json_response({
						request_id: 'failed-123',
						status: 'failed',
						error: 'Research could not complete',
					}),
				),
		);
		const { TavilyResearchProvider } = await import('./index.js');

		await expect(
			new TavilyResearchProvider().search({
				query: 'Fail this task',
			}),
		).rejects.toMatchObject({
			type: 'PROVIDER_ERROR',
			provider: 'tavily_research',
			message: 'Research could not complete',
		});
	});
});
