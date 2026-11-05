import { ValibotJsonSchemaAdapter } from '@tmcp/adapter-valibot';
import { McpServer } from 'tmcp';
import type { GenericSchema } from 'valibot';
import { register_codemode } from './codemode/index.js';

export interface ServerMetadata {
	name: string;
	version: string;
	description: string;
}

/** Create a fully registered MCP server for a transport. */
export function create_mcp_server(
	metadata: ServerMetadata,
): McpServer<GenericSchema> {
	const server = new McpServer(metadata, {
		adapter: new ValibotJsonSchemaAdapter(),
		capabilities: {
			tools: { listChanged: true },
			resources: { listChanged: true },
		},
	});

	register_codemode(server);

	return server;
}
