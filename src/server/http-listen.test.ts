import { ValibotJsonSchemaAdapter } from '@tmcp/adapter-valibot';
import { McpServer } from 'tmcp';
import type { GenericSchema } from 'valibot';
import { describe, expect, it } from 'vitest';
import { load_http_config } from '../config/http.js';
import { start_http_server } from './http-listen.js';

const create_server = () => {
	const adapter = new ValibotJsonSchemaAdapter();
	return new McpServer<GenericSchema>(
		{
			name: 'omnisearch-http-test',
			version: '0.0.0',
			description: 'HTTP auth test server',
		},
		{
			adapter,
			capabilities: {
				tools: { listChanged: true },
			},
		},
	);
};

describe('start_http_server', () => {
	it('wraps the MCP HTTP transport and leaves /health open', async () => {
		const handle = await start_http_server(
			create_server(),
			load_http_config({
				TRANSPORT: 'http',
				HOST: '127.0.0.1',
				PORT: '0',
				AUTH_TOKENS: 'secret-token',
			}),
		);

		try {
			const health = await fetch(
				`http://127.0.0.1:${handle.port}/health`,
			);
			expect(health.status).toBe(200);
			await expect(health.json()).resolves.toEqual({
				status: 'ok',
			});
		} finally {
			await handle.close();
		}
	});
});
