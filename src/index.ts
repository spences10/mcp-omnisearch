#!/usr/bin/env node

import { ValibotJsonSchemaAdapter } from '@tmcp/adapter-valibot';
import { StdioTransport } from '@tmcp/transport-stdio';
import { McpServer } from 'tmcp';
import type { GenericSchema } from 'valibot';
import { validate_config } from './config/env.js';
import { setup_handlers } from './server/handlers.js';
import {
	initialize_providers,
	register_tools,
} from './server/tools/index.js';

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const pkg = JSON.parse(
	readFileSync(join(__dirname, '..', 'package.json'), 'utf8'),
);
const { name, version } = pkg;

class OmnisearchServer {
	private server: McpServer<GenericSchema>;

	constructor() {
		const adapter = new ValibotJsonSchemaAdapter();

		this.server = new McpServer(
			{
				name,
				version,
				description:
					'MCP server for integrating Omnisearch with LLMs',
			},
			{
				adapter,
				capabilities: {
					tools: { listChanged: true },
					resources: { listChanged: true },
				},
			},
		);

		// Validate environment configuration
		validate_config();

		// Initialize and register providers + tools
		initialize_providers();
		register_tools(this.server);
		setup_handlers(this.server);

		// Error handling
		process.on('SIGINT', async () => {
			process.exit(0);
		});
	}

	async run() {
		const transport = new StdioTransport(this.server);
		transport.listen();
		console.error('Omnisearch MCP server running on stdio');
	}
}

const server = new OmnisearchServer();
server.run().catch(console.error);
