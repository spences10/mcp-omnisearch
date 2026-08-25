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

	it('creates an asynchronous research task without blocking', async () => {
		const fetch_mock = vi.fn(
			async (_input: RequestInfo | URL, _init?: RequestInit) =>
				json_response(
					{ request_id: 'research-123', status: 'pending' },
					202,
				),
		);
		vi.stubGlobal('fetch', fetch_mock);
		const { TavilyResearchProvider } = await import('./index.js');

		await expect(
			new TavilyResearchProvider().search({
				query: 'Research this topic',
			}),
		).resolves.toEqual([
			expect.objectContaining({
				title: 'Tavily Research Task',
				snippet: expect.stringContaining('research-123'),
				metadata: {
					type: 'research_task',
					request_id: 'research-123',
					status: 'pending',
				},
			}),
		]);
		expect(fetch_mock).toHaveBeenCalledTimes(1);
		const request = fetch_mock.mock.calls[0]?.[1];
		expect(request).toBeDefined();
		if (!request) throw new Error('Expected research request');
		expect(JSON.parse(request.body as string)).toMatchObject({
			input: 'Research this topic',
			model: 'mini',
			stream: false,
		});
	});

	it('retrieves a completed research task with sources', async () => {
		const fetch_mock = vi.fn(
			async (_input: RequestInfo | URL, _init?: RequestInit) =>
				json_response({
					request_id: 'research-123',
					status: 'completed',
					content: 'Completed research report',
					sources: [
						{
							title: 'Primary source',
							url: 'https://example.com/source',
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
				research_id: 'research-123',
				limit: 1,
			}),
		).resolves.toHaveLength(2);
		expect(fetch_mock.mock.calls[0]?.[0]).toBe(
			'https://api.tavily.com/research/research-123',
		);
	});

	it('returns a provider error when the research task fails', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () =>
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
				research_id: 'failed-123',
			}),
		).rejects.toMatchObject({
			type: 'PROVIDER_ERROR',
			provider: 'tavily_research',
			message: 'Research could not complete',
		});
	});
});
