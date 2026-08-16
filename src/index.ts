#!/usr/bin/env node

import { StdioTransport } from '@tmcp/transport-stdio';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validate_config } from './config/env.js';
import {
	assert_http_can_start,
	load_http_config,
} from './config/http.js';
import { create_mcp_server } from './mcp-server.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const pkg = JSON.parse(
	readFileSync(join(__dirname, '..', 'package.json'), 'utf8'),
);
const { name, version } = pkg;

validate_config();

const server = create_mcp_server({
	name,
	version,
	description: 'MCP server for integrating Omnisearch with LLMs',
});

process.on('SIGINT', () => {
	process.exit(0);
});

const start = async () => {
	const http_config = load_http_config();
	if (http_config.transport === 'http') {
		assert_http_can_start(http_config);
		const { start_http_server } =
			await import('./server/http-listen.js');
		await start_http_server(server, http_config);
		return;
	}

	new StdioTransport(server).listen();
	console.error('Omnisearch MCP server running on stdio');
};

start().catch(console.error);
