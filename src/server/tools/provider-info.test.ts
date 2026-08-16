import { afterEach, describe, expect, it, vi } from 'vitest';
import { ErrorType } from '../../common/types.js';
import { config } from '../../config/env.js';
import { clear_provider_runtime } from '../provider-runtime.js';

interface RegisteredTool {
	definition: { name: string; description?: string };
	handler: (args: Record<string, unknown>) => Promise<{
		content: Array<{ text: string }>;
		isError?: boolean;
	}>;
}

const API_KEY_NAMES = [
	'TAVILY_API_KEY',
	'BRAVE_API_KEY',
	'KAGI_API_KEY',
	'GITHUB_API_KEY',
	'EXA_API_KEY',
	'LINKUP_API_KEY',
	'FIRECRAWL_API_KEY',
];

const SECRET = 'super-secret-brave-token-205';

const create_mock_server = () => {
	const tools: RegisteredTool[] = [];
	return {
		tools,
		server: {
			tool: (
				definition: RegisteredTool['definition'],
				handler: RegisteredTool['handler'],
			) => {
				tools.push({ definition, handler });
			},
		},
	};
};

const load_provider_info = async (
	keys: Record<string, string | undefined>,
) => {
	vi.resetModules();
	clear_provider_runtime();
	for (const key of API_KEY_NAMES) delete process.env[key];
	for (const [key, value] of Object.entries(keys)) {
		if (value !== undefined) process.env[key] = value;
	}

	const tools_module = await import('./index.js');
	const { tools, server } = create_mock_server();
	vi.spyOn(console, 'error').mockImplementation(() => {});
	vi.spyOn(console, 'warn').mockImplementation(() => {});
	tools_module.initialize_providers();
	tools_module.register_tools(server as any);

	const tool = tools.find(
		(entry) => entry.definition.name === 'get_provider_info',
	);
	return { tools, tool, tools_module };
};

const parse_tool_body = (response: {
	content: Array<{ text: string }>;
}) => JSON.parse(response.content[0].text);

const collect_strings = (value: unknown): string[] => {
	if (typeof value === 'string') return [value];
	if (typeof value === 'number' || typeof value === 'boolean') {
		return [String(value)];
	}
	if (Array.isArray(value)) {
		return value.flatMap(collect_strings);
	}
	if (value && typeof value === 'object') {
		return Object.entries(value).flatMap(([key, nested]) => [
			key,
			...collect_strings(nested),
		]);
	}
	return [];
};

afterEach(() => {
	for (const key of API_KEY_NAMES) delete process.env[key];
	clear_provider_runtime();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('get_provider_info', () => {
	it('is registered and lists every provider when no keys are set', async () => {
		const { tools, tool } = await load_provider_info({});

		expect(tools.map((entry) => entry.definition.name)).toEqual([
			'get_provider_info',
		]);
		expect(tool).toBeDefined();

		const body = parse_tool_body(await tool!.handler({}));

		expect(
			body.providers.map((provider: { id: string }) => provider.id),
		).toEqual([
			'tavily',
			'brave',
			'kagi',
			'exa',
			'kagi_enrichment',
			'github',
			'kagi_fastgpt',
			'exa_answer',
			'linkup',
			'tavily:extract',
			'kagi:summarize',
			'firecrawl:scrape',
			'firecrawl:crawl',
			'firecrawl:map',
			'firecrawl:extract',
			'firecrawl:actions',
			'exa:contents',
			'exa:similar',
		]);
		expect(
			body.providers.every(
				(provider: { enabled: boolean }) =>
					provider.enabled === false,
			),
		).toBe(true);
	}, 15_000);

	it('enables only configured providers and reports timeouts and tools', async () => {
		const { tool } = await load_provider_info({
			BRAVE_API_KEY: SECRET,
		});

		const body = parse_tool_body(await tool!.handler({}));
		const by_id = Object.fromEntries(
			body.providers.map((provider: { id: string }) => [
				provider.id,
				provider,
			]),
		);

		expect(by_id.brave).toEqual({
			id: 'brave',
			tools: ['web_search'],
			timeout: config.search.brave.timeout,
			enabled: true,
			cooldown: false,
			last_error_type: null,
		});
		expect(by_id.tavily).toEqual({
			id: 'tavily',
			tools: ['web_search'],
			timeout: config.search.tavily.timeout,
			enabled: false,
			cooldown: false,
			last_error_type: null,
		});
		expect(by_id.github).toEqual({
			id: 'github',
			tools: ['github_search'],
			timeout: config.search.github.timeout,
			enabled: false,
			cooldown: false,
			last_error_type: null,
		});
		expect(by_id['firecrawl:scrape']).toEqual({
			id: 'firecrawl:scrape',
			tools: ['web_extract'],
			timeout: config.processing.firecrawl_scrape.timeout,
			enabled: false,
			cooldown: false,
			last_error_type: null,
		});
		expect(by_id.kagi_fastgpt).toEqual({
			id: 'kagi_fastgpt',
			tools: ['ai_search'],
			timeout: config.ai_response.kagi_fastgpt.timeout,
			enabled: false,
			cooldown: false,
			last_error_type: null,
		});
	});

	it('never returns keys, tokens, or secrets', async () => {
		const { tool } = await load_provider_info({
			BRAVE_API_KEY: SECRET,
			TAVILY_API_KEY: 'tavily-secret-205',
		});

		const response = await tool!.handler({});
		const body = parse_tool_body(response);
		const strings = collect_strings(body);

		expect(response.content[0].text).not.toContain(SECRET);
		expect(response.content[0].text).not.toContain(
			'tavily-secret-205',
		);
		expect(strings).not.toEqual(
			expect.arrayContaining([
				expect.stringMatching(
					/api[_-]?key|token|secret|authorization|password|bearer/i,
				),
			]),
		);
	});

	it('filters by provider id or name', async () => {
		const { tool } = await load_provider_info({
			FIRECRAWL_API_KEY: 'firecrawl-key',
		});

		const by_id = parse_tool_body(
			await tool!.handler({ provider: 'firecrawl:scrape' }),
		);
		expect(by_id.providers).toEqual([
			expect.objectContaining({
				id: 'firecrawl:scrape',
				tools: ['web_extract'],
				enabled: true,
			}),
		]);

		const by_name = parse_tool_body(
			await tool!.handler({ provider: 'firecrawl' }),
		);
		expect(
			by_name.providers.map(
				(provider: { id: string }) => provider.id,
			),
		).toEqual([
			'firecrawl:scrape',
			'firecrawl:crawl',
			'firecrawl:map',
			'firecrawl:extract',
			'firecrawl:actions',
		]);
	});

	it('surfaces last error type from a real provider failure', async () => {
		const { tools, tool } = await load_provider_info({
			BRAVE_API_KEY: SECRET,
		});
		const web_search = tools.find(
			(entry) => entry.definition.name === 'web_search',
		)!;

		vi.stubGlobal(
			'fetch',
			vi
				.fn()
				.mockImplementation(() =>
					Promise.resolve(new Response('nope', { status: 401 })),
				),
		);
		await web_search.handler({
			query: 'example',
			provider: 'brave',
		});

		const body = parse_tool_body(await tool!.handler({}));
		const brave = body.providers.find(
			(provider: { id: string }) => provider.id === 'brave',
		);

		expect(brave).toEqual({
			id: 'brave',
			tools: ['web_search'],
			timeout: config.search.brave.timeout,
			enabled: true,
			cooldown: false,
			last_error_type: ErrorType.AUTH_ERROR,
		});
		expect(JSON.stringify(body)).not.toContain(SECRET);
	});

	it('exposes cooldown when the last error is a rate limit', async () => {
		const { tool } = await load_provider_info({
			BRAVE_API_KEY: SECRET,
		});
		const { record_provider_error } =
			await import('../provider-runtime.js');
		const { ProviderError } = await import('../../common/types.js');

		record_provider_error(
			new ProviderError(
				ErrorType.RATE_LIMIT,
				`Rate limit exceeded for brave using ${SECRET}`,
				'brave',
				{
					reset_time: new Date(Date.now() + 60_000),
					retryable: true,
				},
			),
		);

		const body = parse_tool_body(await tool!.handler({}));
		const brave = body.providers.find(
			(provider: { id: string }) => provider.id === 'brave',
		);

		expect(brave).toEqual({
			id: 'brave',
			tools: ['web_search'],
			timeout: config.search.brave.timeout,
			enabled: true,
			cooldown: true,
			last_error_type: ErrorType.RATE_LIMIT,
		});
		expect(JSON.stringify(body)).not.toContain(SECRET);
	});
});
