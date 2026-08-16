import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from 'vitest';
import type { ResolvedMcpBackend } from '../config/mcp-backends.js';
import {
	call_mcp_tool,
	parse_mcp_response_body,
	unwrap_jsonrpc_result,
} from './mcp-client.js';
import { ErrorType } from './types.js';

const http_backend: ResolvedMcpBackend = {
	id: 'exa_mcp',
	kind: 'http',
	transport_url: 'https://mcp.exa.ai/mcp',
	headers: { 'x-api-key': 'exa-key' },
	env: {},
	tool: 'web_search_exa',
	query_argument: 'query',
	limit_argument: 'numResults',
	static_arguments: {},
	result_path: ['results'],
	field_aliases: {
		title: ['title'],
		url: ['url'],
		snippet: ['text'],
		score: ['score'],
	},
	timeout: 5_000,
	estimated_cost: 0,
};

const json_response = (
	body: unknown,
	headers: Record<string, string> = {},
) =>
	new Response(JSON.stringify(body), {
		status: 200,
		headers: {
			'content-type': 'application/json',
			...headers,
		},
	});

describe('mcp client helpers', () => {
	it('parses JSON-RPC bodies and SSE data frames', () => {
		expect(
			parse_mcp_response_body({
				jsonrpc: '2.0',
				result: { ok: true },
			}),
		).toEqual({ jsonrpc: '2.0', result: { ok: true } });
		expect(
			parse_mcp_response_body(
				'event: message\ndata: {"jsonrpc":"2.0","id":1,"result":{"ok":true}}\n\n',
			),
		).toEqual({ jsonrpc: '2.0', id: 1, result: { ok: true } });
	});

	it('unwraps JSON-RPC errors', () => {
		expect(() =>
			unwrap_jsonrpc_result(
				{ jsonrpc: '2.0', error: { message: 'nope' } },
				'exa_mcp',
			),
		).toThrow(
			expect.objectContaining({
				type: ErrorType.PROVIDER_ERROR,
				message: 'nope',
			}),
		);
	});
});

describe('call_mcp_tool HTTP', () => {
	const fetch_mock = vi.fn();

	beforeEach(() => {
		fetch_mock.mockReset();
		vi.stubGlobal('fetch', fetch_mock);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it('initializes a session then calls the mapped tool', async () => {
		fetch_mock
			.mockResolvedValueOnce(
				json_response(
					{
						jsonrpc: '2.0',
						id: 1,
						result: {
							protocolVersion: '2025-03-26',
							capabilities: {},
							serverInfo: { name: 'exa', version: '1' },
						},
					},
					{ 'mcp-session-id': 'session-1' },
				),
			)
			.mockResolvedValueOnce(new Response(null, { status: 202 }))
			.mockResolvedValueOnce(
				json_response({
					jsonrpc: '2.0',
					id: 2,
					result: {
						structuredContent: {
							results: [
								{
									title: 'Example',
									url: 'https://example.com',
								},
							],
						},
					},
				}),
			);

		await expect(
			call_mcp_tool({
				backend: http_backend,
				tool: 'web_search_exa',
				arguments: { query: 'svelte', numResults: 1 },
			}),
		).resolves.toEqual({
			structuredContent: {
				results: [{ title: 'Example', url: 'https://example.com' }],
			},
		});

		expect(fetch_mock).toHaveBeenCalledTimes(3);
		expect(
			fetch_mock.mock.calls[2][1].headers['Mcp-Session-Id'],
		).toBe('session-1');
		expect(JSON.parse(fetch_mock.mock.calls[2][1].body)).toEqual({
			jsonrpc: '2.0',
			id: 2,
			method: 'tools/call',
			params: {
				name: 'web_search_exa',
				arguments: { query: 'svelte', numResults: 1 },
			},
		});
	});

	it('maps abort timeouts to ProviderError TIMEOUT', async () => {
		const abort_error = new Error('aborted');
		abort_error.name = 'TimeoutError';
		fetch_mock.mockRejectedValue(abort_error);

		await expect(
			call_mcp_tool({
				backend: http_backend,
				tool: 'web_search_exa',
				arguments: { query: 'svelte' },
			}),
		).rejects.toMatchObject({
			type: ErrorType.TIMEOUT,
			provider: 'exa_mcp',
		});
	});

	it('rejects HTTP backends without a transport URL', async () => {
		await expect(
			call_mcp_tool({
				backend: { ...http_backend, transport_url: undefined },
				tool: 'web_search_exa',
				arguments: { query: 'svelte' },
			}),
		).rejects.toMatchObject({
			type: ErrorType.INVALID_INPUT,
			message: expect.stringContaining('transport_url'),
		});
	});
});

describe('call_mcp_tool stdio', () => {
	it('rejects stdio backends without a command', async () => {
		await expect(
			call_mcp_tool({
				backend: {
					...http_backend,
					kind: 'stdio',
					command: undefined,
				},
				tool: 'search',
				arguments: { query: 'stdio' },
			}),
		).rejects.toMatchObject({
			type: ErrorType.INVALID_INPUT,
			message: expect.stringContaining('command'),
		});
	});

	it('speaks Content-Length JSON-RPC with a child process', async () => {
		const dir = await mkdtemp(join(tmpdir(), 'mcp-backend-'));
		const script = join(dir, 'server.mjs');
		await writeFile(
			script,
			`
let buf = Buffer.alloc(0);
process.stdin.on('data', (chunk) => {
  buf = Buffer.concat([buf, chunk]);
  for (;;) {
    const idx = buf.indexOf('\\r\\n\\r\\n');
    if (idx === -1) break;
    const header = buf.subarray(0, idx).toString('utf8');
    const match = header.match(/Content-Length:\\s*(\\d+)/i);
    const n = Number(match[1]);
    if (buf.length < idx + 4 + n) break;
    const msg = JSON.parse(buf.subarray(idx + 4, idx + 4 + n).toString('utf8'));
    buf = buf.subarray(idx + 4 + n);
    const send = (obj) => {
      const json = JSON.stringify(obj);
      const body = Buffer.from(json, 'utf8');
      process.stdout.write('Content-Length: ' + body.length + '\\r\\n\\r\\n');
      process.stdout.write(body);
    };
    if (msg.method === 'initialize') {
      send({ jsonrpc: '2.0', id: msg.id, result: { protocolVersion: '2025-03-26', capabilities: {}, serverInfo: { name: 'mock', version: '0' } } });
    } else if (msg.method === 'tools/call') {
      send({ jsonrpc: '2.0', id: msg.id, result: { structuredContent: { results: [{ title: 'Stdio', url: 'https://example.com' }] } } });
    }
  }
});
`,
		);

		await expect(
			call_mcp_tool({
				backend: {
					...http_backend,
					id: 'local_search',
					kind: 'stdio',
					command: [process.execPath, script],
					transport_url: undefined,
				},
				tool: 'search',
				arguments: { query: 'stdio' },
			}),
		).resolves.toEqual({
			structuredContent: {
				results: [{ title: 'Stdio', url: 'https://example.com' }],
			},
		});
	});
});
