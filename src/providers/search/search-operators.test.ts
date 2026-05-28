import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from 'vitest';

const fetch_mock = vi.fn();

const json_response = (body: unknown) =>
	new Response(JSON.stringify(body), {
		status: 200,
		headers: { 'Content-Type': 'application/json' },
	});

beforeEach(() => {
	fetch_mock.mockReset();
	vi.stubGlobal('fetch', fetch_mock);
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.unstubAllEnvs();
	vi.restoreAllMocks();
	vi.resetModules();
});

describe('search provider operator handling', () => {
	it('passes rich operators through for Brave, including provider-native in: operators', async () => {
		vi.stubEnv('BRAVE_API_KEY', 'brave-key');
		const { BraveSearchProvider } = await import('./brave/index.js');
		fetch_mock.mockResolvedValue(
			json_response({
				web: {
					results: [
						{
							title: 'Brave result',
							url: 'https://example.com/brave',
							description: 'Brave snippet',
						},
					],
				},
			}),
		);

		await new BraveSearchProvider().search({
			query:
				'sveltekit in:title site:kit.svelte.dev -site:spam.dev filetype:pdf intitle:guide inurl:docs inbody:load inpage:actions lang:en loc:us before:2024 after:2023 "remote functions" +forms -legacy',
			limit: 7,
			include_domains: ['docs.example.com'],
			exclude_domains: ['ads.example.com'],
		});

		const request_url = new URL(fetch_mock.mock.calls[0][0]);

		expect(request_url.searchParams.get('count')).toBe('7');
		expect(request_url.searchParams.get('q')).toBe(
			'sveltekit in:title site:docs.example.com OR site:kit.svelte.dev -site:ads.example.com -site:spam.dev filetype:pdf intitle:guide inurl:docs inbody:load inpage:actions lang:en loc:us before:2024 after:2023 "remote functions" +forms -legacy',
		);
	});

	it('uses Kagi parameters for file type and dates while preserving query operators', async () => {
		vi.stubEnv('KAGI_API_KEY', 'kagi-key');
		const { KagiSearchProvider } = await import('./kagi/index.js');
		fetch_mock.mockResolvedValue(
			json_response({
				data: [
					{
						title: 'Kagi result',
						url: 'https://example.com/kagi',
						snippet: 'Kagi snippet',
						rank: 1,
					},
				],
			}),
		);

		await new KagiSearchProvider().search({
			query:
				'sveltekit in:title site:kit.svelte.dev filetype:pdf intitle:guide before:2024 after:2023 "remote functions"',
			limit: 4,
		});

		const request_url = new URL(fetch_mock.mock.calls[0][0]);

		expect(request_url.searchParams.get('limit')).toBe('4');
		expect(request_url.searchParams.get('file_type')).toBe('pdf');
		expect(request_url.searchParams.get('time_range')).toBe(
			'after:2023,before:2024',
		);
		expect(request_url.searchParams.get('q')).toBe(
			'sveltekit in:title site:kit.svelte.dev intitle:guide "remote functions"',
		);
	});

	it('translates supported operators into Tavily API fields', async () => {
		vi.stubEnv('TAVILY_API_KEY', 'tavily-key');
		const { TavilySearchProvider } =
			await import('./tavily/index.js');
		fetch_mock.mockResolvedValue(
			json_response({
				results: [
					{
						title: 'Tavily result',
						url: 'https://example.com/tavily',
						content: 'Tavily snippet',
						score: 0.9,
					},
				],
				response_time: 0.1,
			}),
		);

		await new TavilySearchProvider().search({
			query:
				'sveltekit in:title site:kit.svelte.dev -site:spam.dev before:2024 after:2023 loc:US "remote functions"',
			limit: 3,
			include_domains: ['docs.example.com'],
			exclude_domains: ['ads.example.com'],
		});

		const [, options] = fetch_mock.mock.calls[0];
		const body = JSON.parse(options.body);

		expect(body).toEqual({
			query: 'sveltekit in:title "remote functions"',
			max_results: 3,
			include_domains: ['docs.example.com', 'kit.svelte.dev'],
			exclude_domains: ['ads.example.com', 'spam.dev'],
			search_depth: 'basic',
			topic: 'general',
			start_date: '2023',
			end_date: '2024',
			exact_match: true,
			country: 'us',
		});
	});
});
