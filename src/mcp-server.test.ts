import { afterEach, describe, expect, it, vi } from 'vitest';
import { create_mcp_server } from './mcp-server.js';

const modern_meta = {
	'io.modelcontextprotocol/protocolVersion': '2026-07-28',
	'io.modelcontextprotocol/clientCapabilities': {},
	'io.modelcontextprotocol/clientInfo': {
		name: 'protocol-test',
		version: '1.0.0',
	},
};

function create_server() {
	vi.spyOn(console, 'error').mockImplementation(() => {});
	return create_mcp_server({
		name: 'mcp-omnisearch',
		version: 'test',
		description: 'test server',
	});
}

function request(
	server: ReturnType<typeof create_mcp_server>,
	id: number,
	method: string,
	params: Record<string, unknown> = {},
) {
	return server.receive({
		jsonrpc: '2.0',
		id,
		method,
		params: {
			...params,
			_meta: modern_meta,
		},
	});
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe('MCP 2026-07-28 protocol', () => {
	it('supports stateless discovery and capability listing', async () => {
		const server = create_server();

		const discovery = await request(server, 1, 'server/discover');
		expect(discovery).toMatchObject({
			jsonrpc: '2.0',
			id: 1,
			result: {
				supportedVersions: ['2026-07-28'],
				capabilities: { tools: {}, resources: {} },
				resultType: 'complete',
				_meta: {
					'io.modelcontextprotocol/serverInfo': {
						name: 'mcp-omnisearch',
					},
				},
			},
		});

		const tools = await request(server, 2, 'tools/list');
		expect(tools).toMatchObject({
			jsonrpc: '2.0',
			id: 2,
			result: { tools: expect.any(Array) },
		});

		const resources = await request(server, 3, 'resources/list');
		expect(resources).toMatchObject({
			jsonrpc: '2.0',
			id: 3,
			result: {
				resources: expect.arrayContaining([
					expect.objectContaining({
						name: 'provider-status',
						uri: 'omnisearch://providers/status',
					}),
				]),
			},
		});
	});

	it('reads resources and returns modern errors statelessly', async () => {
		const server = create_server();

		const resource = await request(server, 4, 'resources/read', {
			uri: 'omnisearch://providers/status',
		});
		expect(resource).toMatchObject({
			jsonrpc: '2.0',
			id: 4,
			result: {
				contents: [
					expect.objectContaining({
						uri: 'omnisearch://providers/status',
						mimeType: 'application/json',
					}),
				],
			},
		});

		const missing_tool = await request(server, 5, 'tools/call', {
			name: 'not_a_tool',
			arguments: {},
		});
		expect(missing_tool).toMatchObject({
			jsonrpc: '2.0',
			id: 5,
			result: {
				isError: true,
				resultType: 'complete',
				content: [
					expect.objectContaining({
						type: 'text',
						text: 'Tool not_a_tool not found',
					}),
				],
			},
		});

		const unsupported_version = await server.receive({
			jsonrpc: '2.0',
			id: 6,
			method: 'resources/list',
			params: {
				_meta: {
					...modern_meta,
					'io.modelcontextprotocol/protocolVersion': '2099-01-01',
				},
			},
		});
		expect(unsupported_version).toMatchObject({
			jsonrpc: '2.0',
			id: 6,
			error: { code: -32022 },
		});
	});
});
