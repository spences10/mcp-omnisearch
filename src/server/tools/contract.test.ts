import * as v from 'valibot';
import { afterEach, describe, expect, it, vi } from 'vitest';

interface RegisteredTool {
	definition: {
		name: string;
		schema: v.BaseSchema<unknown, unknown, v.BaseIssue<unknown>>;
	};
	handler: (args: any) => Promise<any>;
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

const load_contract = async (
	keys: Record<string, string | undefined>,
) => {
	vi.resetModules();
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
	return { tools, tools_module };
};

const parse_tool_body = (response: {
	content: Array<{ text: string }>;
}) => JSON.parse(response.content[0].text);

const mock_tavily_extract_response = (content: string) => {
	vi.stubGlobal(
		'fetch',
		vi.fn().mockResolvedValue(
			new Response(
				JSON.stringify({
					results: [
						{
							url: 'https://example.com',
							raw_content: content,
						},
					],
					failed_results: [],
					response_time: 0.1,
				}),
				{ status: 200 },
			),
		),
	);
};

afterEach(() => {
	for (const key of API_KEY_NAMES) delete process.env[key];
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('MCP tool contract', () => {
	it('registers no public tools when no providers are configured', async () => {
		const { tools, tools_module } = await load_contract({});

		expect(tools).toEqual([]);
		expect(tools_module.provider_status_entries).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					id: 'brave',
					status: 'unavailable',
					unavailable_reason: 'missing_api_key',
				}),
			]),
		);
	});

	it('registers tools from the configured provider set', async () => {
		const { tools } = await load_contract({
			BRAVE_API_KEY: 'brave-key',
			GITHUB_API_KEY: 'github-token',
			KAGI_API_KEY: 'kagi-key',
			FIRECRAWL_API_KEY: 'firecrawl-key',
		});

		expect(tools.map((tool) => tool.definition.name)).toEqual([
			'web_search',
			'github_search',
			'ai_search',
			'web_extract',
		]);
	});

	it('validates public web_search payloads at the registered schema', async () => {
		const { tools } = await load_contract({
			BRAVE_API_KEY: 'brave-key',
		});
		const schema = tools.find(
			(tool) => tool.definition.name === 'web_search',
		)!.definition.schema;

		expect(
			v.safeParse(schema, {
				query: 'sveltekit docs',
				provider: 'brave',
				limit: 5,
				include_domains: ['svelte.dev'],
				large_result_mode: 'inline',
			}).success,
		).toBe(true);
		expect(
			v.safeParse(schema, { query: '', provider: 'brave' }).success,
		).toBe(false);
		expect(
			v.safeParse(schema, {
				query: 'test',
				provider: 'brave',
				include_domains: ['bad-domain'],
			}).success,
		).toBe(false);
		expect(
			v.safeParse(schema, {
				query: 'test',
				provider: 'brave',
				limit: 51,
			}).success,
		).toBe(false);
		expect(
			v.safeParse(schema, { query: 'test', provider: 'kagi' })
				.success,
		).toBe(false);
		expect(
			v.safeParse(schema, {
				query: 'sveltekit docs',
				provider: 'brave',
				mode: 'research',
				research_time_budget: 20,
				research_extract: false,
				research_extract_count: 2,
			}).success,
		).toBe(true);
		expect(
			v.safeParse(schema, {
				query: 'sveltekit docs',
				provider: 'brave',
				mode: 'deep',
			}).success,
		).toBe(false);
		expect(
			v.safeParse(schema, {
				query: 'sveltekit docs',
				provider: 'brave',
				mode: 'research',
				research_time_budget: 80,
			}).success,
		).toBe(false);
	});

	it('validates public web_extract payloads and unavailable modes at the MCP layer', async () => {
		const { tools } = await load_contract({
			TAVILY_API_KEY: 'tavily-key',
		});
		const tool = tools.find(
			(entry) => entry.definition.name === 'web_extract',
		)!;

		expect(
			v.safeParse(tool.definition.schema, {
				url: 'https://example.com',
				provider: 'tavily',
				mode: 'extract',
				include_raw_contents: false,
			}).success,
		).toBe(true);
		expect(
			v.safeParse(tool.definition.schema, {
				url: 'not-a-url',
				provider: 'tavily',
			}).success,
		).toBe(false);
		expect(
			v.safeParse(tool.definition.schema, {
				url: 'https://example.com',
				provider: 'tavily',
				mode: 'bogus',
			}).success,
		).toBe(false);

		const response = await tool.handler({
			url: 'https://example.com',
			provider: 'tavily',
			mode: 'summarize',
		});
		const body = parse_tool_body(response);

		expect(response.isError).toBe(true);
		expect(body).toEqual(
			expect.objectContaining({
				type: 'INVALID_INPUT',
				provider: 'web_extract',
				retryable: false,
			}),
		);
	});

	it('returns success and provider error shapes through registered web_search handler', async () => {
		const { tools } = await load_contract({
			BRAVE_API_KEY: 'brave-key',
		});
		const tool = tools.find(
			(entry) => entry.definition.name === 'web_search',
		)!;

		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						web: {
							results: [
								{
									title: 'Example',
									url: 'https://example.com',
									description: 'Example result',
								},
							],
						},
					}),
					{ status: 200 },
				),
			),
		);

		const success = await tool.handler({
			query: 'example',
			provider: 'brave',
			large_result_mode: 'inline',
		});
		expect(parse_tool_body(success)).toEqual([
			{
				title: 'Example',
				url: 'https://example.com',
				snippet: 'Example result',
				source_provider: 'brave',
			},
		]);

		vi.stubGlobal(
			'fetch',
			vi
				.fn()
				.mockResolvedValue(new Response('nope', { status: 401 })),
		);
		const failure = await tool.handler({
			query: 'example',
			provider: 'brave',
		});

		expect(failure.isError).toBe(true);
		expect(parse_tool_body(failure)).toEqual({
			error: 'Invalid API key',
			type: 'AUTH_ERROR',
			provider: 'brave',
			retryable: false,
		});
	});

	it('keeps default web_search single-provider and supports research mode', async () => {
		const { tools } = await load_contract({
			BRAVE_API_KEY: 'brave-key',
			TAVILY_API_KEY: 'tavily-key',
		});
		const tool = tools.find(
			(entry) => entry.definition.name === 'web_search',
		)!;

		vi.stubGlobal(
			'fetch',
			vi.fn().mockImplementation(async (url: string) => {
				const href = String(url);
				if (href.includes('api.search.brave.com')) {
					return new Response(
						JSON.stringify({
							web: {
								results: [
									{
										title: 'Brave Result',
										url: 'https://brave.example/a',
										description: 'From brave',
									},
								],
							},
						}),
						{ status: 200 },
					);
				}
				if (href.includes('/search')) {
					return new Response(
						JSON.stringify({
							results: [
								{
									title: 'Tavily Result',
									url: 'https://tavily.example/b',
									content: 'From tavily',
									score: 0.9,
								},
							],
						}),
						{ status: 200 },
					);
				}
				if (href.includes('/extract')) {
					return new Response(
						JSON.stringify({
							results: [
								{
									url: 'https://brave.example/a',
									raw_content: 'Extracted page',
								},
							],
							failed_results: [],
							response_time: 0.1,
						}),
						{ status: 200 },
					);
				}
				return new Response('missing mock', { status: 404 });
			}),
		);

		const single = parse_tool_body(
			await tool.handler({
				query: 'example',
				provider: 'brave',
				large_result_mode: 'inline',
			}),
		);
		expect(single).toEqual([
			{
				title: 'Brave Result',
				url: 'https://brave.example/a',
				snippet: 'From brave',
				source_provider: 'brave',
			},
		]);

		const research = parse_tool_body(
			await tool.handler({
				query: 'example',
				provider: 'brave',
				mode: 'research',
				research_extract: true,
				research_extract_count: 1,
				large_result_mode: 'inline',
			}),
		);

		expect(research.mode).toBe('research');
		expect(
			research.results.map((item: { url: string }) => item.url),
		).toEqual([
			'https://brave.example/a',
			'https://tavily.example/b',
		]);
		expect(research.research.selected).toEqual(['brave', 'tavily']);
		expect(research.research.succeeded).toEqual(
			expect.arrayContaining(['brave', 'tavily']),
		);
		expect(research.research.extract.status).toBe('succeeded');
		expect(research.extracts.content).toContain('Extracted page');
	});

	it('covers large-result inline/file modes and compact extraction at the MCP layer', async () => {
		const { tools } = await load_contract({
			TAVILY_API_KEY: 'tavily-key',
		});
		const tool = tools.find(
			(entry) => entry.definition.name === 'web_extract',
		)!;
		const large_content = `# Large\n${'word '.repeat(20_000)}`;

		mock_tavily_extract_response('small content');
		const compact = parse_tool_body(
			await tool.handler({
				url: 'https://example.com',
				provider: 'tavily',
				mode: 'extract',
				include_raw_contents: false,
				large_result_mode: 'inline',
			}),
		);
		expect(compact.raw_contents).toBeUndefined();
		expect(compact.content).toBe('small content');

		mock_tavily_extract_response(large_content);
		const inline = parse_tool_body(
			await tool.handler({
				url: 'https://example.com',
				provider: 'tavily',
				mode: 'extract',
				large_result_mode: 'inline',
			}),
		);
		expect(inline.raw_contents[0].content).toBe(large_content);

		mock_tavily_extract_response(large_content);
		const file = parse_tool_body(
			await tool.handler({
				url: 'https://example.com',
				provider: 'tavily',
				mode: 'extract',
				large_result_mode: 'file',
			}),
		);
		expect(file).toEqual(
			expect.objectContaining({
				file_path: expect.stringContaining('mcp-web_extract-'),
				estimated_tokens: expect.any(Number),
				read_hint: expect.stringContaining('Use Read tool'),
			}),
		);
	});
});
