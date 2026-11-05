import { afterEach, describe, expect, it, vi } from 'vitest';
import { create_mcp_server } from '../mcp-server.js';
import { execute_code, provider_declaration } from './index.js';
import * as providers from './providers.js';
import { provider_operations } from './schema-tools.js';

const meta = {
	'io.modelcontextprotocol/protocolVersion': '2026-07-28',
	'io.modelcontextprotocol/clientCapabilities': {},
	'io.modelcontextprotocol/clientInfo': {
		name: 'codemode-test',
		version: '1',
	},
};

function server_request(
	server: ReturnType<typeof create_mcp_server>,
	method: string,
	params: Record<string, unknown> = {},
) {
	return server.receive({
		jsonrpc: '2.0',
		id: 1,
		method,
		params: { ...params, _meta: meta },
	});
}

function server() {
	vi.spyOn(providers, 'provider_connections').mockReturnValue({
		tavily: {
			base_url: 'https://api.tavily.com',
			api_key: 'test-only-key',
			timeout: 1000,
		},
		exa: {
			base_url: 'https://api.exa.ai',
			api_key: undefined,
			timeout: 1000,
		},
	});
	return create_mcp_server({
		name: 'test',
		version: '1',
		description: 'Code Mode test',
	});
}

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	vi.unstubAllEnvs();
});

describe('generated provider declarations', () => {
	it('omits prose without losing fields, constraints, references or validation schemas', () => {
		const schema = {
			type: 'object',
			description: 'Long root documentation',
			properties: {
				description: {
					type: 'string',
					description: 'Long field documentation',
				},
				query: {
					type: 'string',
					minLength: 1,
					description: 'Long query documentation',
				},
				limit: {
					type: 'integer',
					minimum: 1,
					maximum: 10,
					default: 3,
				},
				mode: { $ref: '#/$defs/description' },
				metadata: {
					type: 'object',
					default: { description: 'literal data' },
				},
			},
			required: ['description', 'query'],
			$defs: {
				description: {
					type: 'string',
					enum: ['basic', 'advanced'],
					description: 'Long referenced documentation',
				},
			},
		};
		const original = structuredClone(schema);
		const declaration = provider_declaration({
			name: 'example',
			description: 'Repeated function prose',
			inputSchema: schema,
			execute: () => undefined,
		});
		expect(declaration).not.toContain('documentation');
		expect(declaration).not.toContain('Repeated function prose');
		expect(declaration).toContain('description: string;');
		expect(declaration).toContain('query: string;');
		expect(declaration).toContain('limit?: number;');
		expect(declaration).toContain(
			'@integer @minimum 1 @maximum 10 @default 3',
		);
		expect(declaration).toContain('mode?: "basic" | "advanced";');
		expect(declaration).toContain(
			'@default {"description":"literal data"}',
		);
		expect(schema).toEqual(original);
	});

	it('keeps Tavily search discovery under four thousand characters', () => {
		const operation = provider_operations.find(
			(entry) => entry.name === 'tavily_search',
		)!;
		const declaration = provider_declaration({
			...operation,
			execute: () => undefined,
		});
		expect(declaration.length).toBeLessThan(4000);
		expect(declaration).toContain('max_results?: number;');
		expect(declaration).toContain('search_depth?:');
	});

	it.each(provider_operations)(
		'$name retains a usable argument type',
		(operation) => {
			const declaration = provider_declaration({
				...operation,
				execute: () => undefined,
			});
			expect(declaration).toContain(operation.name);
			expect(declaration).not.toContain('(args: unknown)');
			if (operation.name === 'exa_contents') {
				expect(declaration).toContain('urls?:');
				expect(declaration).toContain('ids?:');
			}
		},
	);
});

describe('Pi Code Mode MCP interface', () => {
	it('advertises only search and execute without a mode setting', async () => {
		vi.stubEnv('OMNISEARCH_TOOL_MODE', undefined);
		const response = await server_request(server(), 'tools/list');
		expect(response).toMatchObject({
			result: {
				tools: [
					{ name: 'search', annotations: { readOnlyHint: true } },
					{
						name: 'execute',
						annotations: {
							readOnlyHint: false,
							idempotentHint: false,
						},
					},
				],
			},
		});
	});

	it('ignores the obsolete mode switch', async () => {
		vi.stubEnv('OMNISEARCH_TOOL_MODE', 'legacy');
		const response = await server_request(server(), 'tools/list');
		expect(response).toMatchObject({
			result: { tools: [{ name: 'search' }, { name: 'execute' }] },
		});
	});

	it.each([
		'web_search',
		'ai_search',
		'web_extract',
		'github_search',
	])('does not register the removed %s tool', async (name) => {
		const response = await server_request(server(), 'tools/call', {
			name,
			arguments: {},
		});
		expect(response).toMatchObject({
			result: {
				isError: true,
				content: [{ type: 'text', text: `Tool ${name} not found` }],
			},
		});
	});

	it('discovers only configured functions and generates declarations from their schemas', async () => {
		const instance = server();
		const catalog = await server_request(instance, 'tools/call', {
			name: 'search',
			arguments: {},
		});
		const text = JSON.stringify(catalog);
		expect(text).toContain('tavily_search');
		expect(text).not.toContain('exa_search');
		expect(text).not.toContain('test-only-key');
		expect(text).not.toContain('declaration');
		const details = await server_request(instance, 'tools/call', {
			name: 'search',
			arguments: { query: 'tavily_search' },
		});
		expect(JSON.stringify(details)).toContain('max_results?:');
		expect(JSON.stringify(details)).toContain('declare const tools');
	});

	it('executes generated native functions without returning intermediate provider data', async () => {
		const fetch_mock = vi.fn().mockResolvedValue(
			Response.json({
				results: [
					{
						title: 'Result',
						url: 'https://example.com',
						content: 'Intermediate content',
					},
				],
			}),
		);
		vi.stubGlobal('fetch', fetch_mock);
		const response = await server_request(server(), 'tools/call', {
			name: 'execute',
			arguments: {
				code: 'const r = await tools.tavily_search({query: "test", max_results: 1}); return r.results.map(({url}) => url);',
			},
		});
		expect(response).toMatchObject({
			result: {
				isError: false,
				content: [
					{
						type: 'text',
						text: expect.stringContaining('https://example.com'),
					},
				],
			},
		});
		expect(JSON.stringify(response)).not.toContain(
			'Intermediate content',
		);
		expect(JSON.stringify(response)).not.toContain('test-only-key');
		expect(fetch_mock).toHaveBeenCalledOnce();
	});

	it('reports script and schema failures as MCP tool errors', async () => {
		const instance = server();
		const invalid = await server_request(instance, 'tools/call', {
			name: 'execute',
			arguments: {
				code: 'return await tools.tavily_search({max_results: 1})',
			},
		});
		expect(invalid).toMatchObject({ result: { isError: true } });
		expect(JSON.stringify(invalid)).toContain(
			'Invalid tavily_search arguments',
		);
		const timeout = await server_request(instance, 'tools/call', {
			name: 'execute',
			arguments: { code: 'return 1', timeout_ms: 180001 },
		});
		expect(timeout).toMatchObject({ result: { isError: true } });
	});

	it('exposes provider status without credentials', async () => {
		const result = await server_request(server(), 'resources/read', {
			uri: 'omnisearch://providers/status',
		});
		expect(JSON.stringify(result)).toContain('unavailable');
		expect(JSON.stringify(result)).toContain('tavily_search');
		expect(JSON.stringify(result)).not.toContain('test-only-key');
	});
});

describe('Pi QuickJS execution boundary', () => {
	it('supports parallel tool calls, output and return values', async () => {
		const call = vi
			.fn()
			.mockImplementation(async (args: unknown) => args);
		const result = await execute_code(
			'const values = await Promise.all([tools.echo({id: 1}), tools.echo({id: 2})]); text("done"); return values.map(x => x.id);',
			[{ name: 'echo', execute: call }],
		);
		expect(result).toMatchObject({
			ok: true,
			value: [1, 2],
			output: [{ type: 'text', text: 'done' }],
		});
		expect(call).toHaveBeenCalledTimes(2);
	});

	it('does not expose filesystem, process, modules, networking or timers', async () => {
		const result = await execute_code(
			'return [typeof process, typeof require, typeof fetch, typeof setTimeout, typeof WebAssembly];',
			[],
		);
		expect(result).toMatchObject({
			ok: true,
			value: Array(5).fill('undefined'),
		});
	});

	it('limits the number of host calls even when the script catches errors', async () => {
		const call = vi.fn().mockResolvedValue(1);
		const result = await execute_code(
			'for (let i = 0; i < 25; i++) { try { await tools.echo({}); } catch {} } return "done";',
			[{ name: 'echo', execute: call }],
		);
		expect(result).toMatchObject({ ok: true, value: 'done' });
		expect(call).toHaveBeenCalledTimes(20);
	});

	it('stops a CPU-bound script at its deadline', async () => {
		const result = await execute_code('while (true) {}', [], {
			timeout_ms: 300,
		});
		expect(result).toMatchObject({
			ok: false,
			error: { kind: 'timeout' },
		});
	});

	it('aborts in-flight host calls on cancellation', async () => {
		const controller = new AbortController();
		let mark_started = () => {};
		const started = new Promise<void>((resolve) => {
			mark_started = resolve;
		});
		const cancelled = vi.fn();
		const pending = execute_code(
			'return await tools.wait({});',
			[
				{
					name: 'wait',
					execute: (_, { signal }) => {
						mark_started();
						return new Promise((_, reject) =>
							signal.addEventListener(
								'abort',
								() => {
									cancelled();
									reject(signal.reason);
								},
								{ once: true },
							),
						);
					},
				},
			],
			{ signal: controller.signal },
		);
		await started;
		controller.abort();
		expect(await pending).toMatchObject({
			ok: false,
			error: { kind: 'aborted' },
		});
		expect(cancelled).toHaveBeenCalledOnce();
	});

	it('does not persist script state between calls', async () => {
		expect(
			await execute_code('store("id", 1); return load("id");', []),
		).toMatchObject({ ok: true, value: 1 });
		expect(
			await execute_code('return load("id");', []),
		).toMatchObject({ ok: true, value: undefined });
	});
});
