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

const request_url = (input: RequestInfo | URL) => {
	if (typeof input === 'string') return input;
	if (input instanceof URL) return input.href;
	return input.url;
};

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
				query: 'test',
				providers: ['exa', 'tavily'],
			}).success,
		).toBe(true);
		expect(
			v.safeParse(schema, {
				query: 'test',
				provider: 'brave',
				providers: ['tavily'],
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

	it('fans out web_search across selected configured providers and skips missing keys', async () => {
		const { tools } = await load_contract({
			EXA_API_KEY: 'exa-key',
			TAVILY_API_KEY: 'tavily-key',
		});
		const tool = tools.find(
			(entry) => entry.definition.name === 'web_search',
		)!;
		const fetch = vi.fn(async (input: RequestInfo | URL) => {
			const url = request_url(input);
			if (url.includes('api.exa.ai')) {
				return new Response(
					JSON.stringify({
						requestId: 'req-1',
						results: [
							{
								id: 'id-1',
								title: 'Exa result',
								url: 'https://exa.example',
								text: 'From Exa',
								score: 0.8,
							},
						],
					}),
					{ status: 200 },
				);
			}
			if (url.includes('api.tavily.com')) {
				return new Response(
					JSON.stringify({
						results: [
							{
								title: 'Tavily result',
								url: 'https://tavily.example',
								content: 'From Tavily',
								score: 0.7,
							},
						],
					}),
					{ status: 200 },
				);
			}
			return new Response('unexpected', { status: 404 });
		});
		vi.stubGlobal('fetch', fetch);

		const body = parse_tool_body(
			await tool.handler({
				query: 'sveltekit',
				providers: ['exa', 'tavily'],
				large_result_mode: 'inline',
			}),
		);

		expect(fetch).toHaveBeenCalledTimes(2);
		expect(body).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					title: 'Exa result',
					url: 'https://exa.example',
					source_provider: 'exa',
				}),
				expect.objectContaining({
					title: 'Tavily result',
					url: 'https://tavily.example',
					source_provider: 'tavily',
				}),
			]),
		);
	});

	it('keeps single-provider web_search on one path and skips unconfigured fan-out names', async () => {
		const { tools } = await load_contract({
			EXA_API_KEY: 'exa-key',
			TAVILY_API_KEY: 'tavily-key',
		});
		const tool = tools.find(
			(entry) => entry.definition.name === 'web_search',
		)!;
		const fetch = vi.fn(async (input: RequestInfo | URL) => {
			const url = request_url(input);
			if (url.includes('api.exa.ai')) {
				return new Response(
					JSON.stringify({
						requestId: 'req-1',
						results: [
							{
								id: 'id-1',
								title: 'Exa only',
								url: 'https://exa.example',
								text: 'Single path',
							},
						],
					}),
					{ status: 200 },
				);
			}
			return new Response('unexpected', { status: 404 });
		});
		vi.stubGlobal('fetch', fetch);

		const single = parse_tool_body(
			await tool.handler({
				query: 'sveltekit',
				provider: 'exa',
				large_result_mode: 'inline',
			}),
		);

		expect(fetch).toHaveBeenCalledTimes(1);
		expect(
			request_url(fetch.mock.calls[0]?.[0] as RequestInfo | URL),
		).toContain('api.exa.ai');
		expect(single).toEqual([
			expect.objectContaining({
				title: 'Exa only',
				source_provider: 'exa',
			}),
		]);

		const { tools: exa_only_tools } = await load_contract({
			EXA_API_KEY: 'exa-key',
		});
		const exa_only = exa_only_tools.find(
			(entry) => entry.definition.name === 'web_search',
		)!;
		const skipped_fetch = vi.fn(async () => {
			return new Response(
				JSON.stringify({
					requestId: 'req-2',
					results: [
						{
							id: 'id-2',
							title: 'Exa after skip',
							url: 'https://exa.example/skip',
							text: 'Skipped tavily',
						},
					],
				}),
				{ status: 200 },
			);
		});
		vi.stubGlobal('fetch', skipped_fetch);

		const skipped = parse_tool_body(
			await exa_only.handler({
				query: 'sveltekit',
				providers: ['exa', 'tavily'],
				large_result_mode: 'inline',
			}),
		);

		expect(skipped_fetch).toHaveBeenCalledTimes(1);
		expect(skipped).toEqual([
			expect.objectContaining({
				title: 'Exa after skip',
				source_provider: 'exa',
			}),
		]);

		const missing = parse_tool_body(
			await exa_only.handler({
				query: 'sveltekit',
				providers: ['tavily', 'brave'],
			}),
		);
		expect(missing).toEqual(
			expect.objectContaining({
				type: 'INVALID_INPUT',
				provider: 'web_search',
				retryable: false,
			}),
		);
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
