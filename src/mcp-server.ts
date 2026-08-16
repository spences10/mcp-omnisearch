import { ValibotJsonSchemaAdapter } from '@tmcp/adapter-valibot';
import { McpServer } from 'tmcp';
import type { GenericSchema } from 'valibot';
import { setup_handlers } from './server/handlers.js';
import {
	initialize_providers,
	register_tools,
} from './server/tools/index.js';

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

	initialize_providers();
	register_tools(server);
	setup_handlers(server);

	return server;
}
