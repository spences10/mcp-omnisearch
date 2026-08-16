#!/usr/bin/env node

import { StdioTransport } from '@tmcp/transport-stdio';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	parse_startup,
	run_provider_bench_cli,
} from './bench/cli.js';
import { validate_config } from './config/env.js';
import { create_mcp_server } from './mcp-server.js';
import {
	get_search_provider_entries,
	initialize_providers,
} from './server/tools/index.js';
import { to_benchable_providers } from './server/tools/provider-bench.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const pkg = JSON.parse(
	readFileSync(join(__dirname, '..', 'package.json'), 'utf8'),
);
const { name, version } = pkg;

const startup = parse_startup(process.argv.slice(2));

if (startup.action === 'help') {
	console.log(startup.text);
} else if (startup.action === 'error') {
	console.error(startup.message);
	process.exitCode = 1;
} else if (startup.action === 'bench') {
	validate_config();
	initialize_providers();
	void run_provider_bench_cli({
		args: process.argv.slice(2),
		providers: to_benchable_providers(get_search_provider_entries()),
	}).then((code) => {
		process.exit(code);
	});
} else {
	validate_config();

	const server = create_mcp_server({
		name,
		version,
		description: 'MCP server for integrating Omnisearch with LLMs',
	});

	process.on('SIGINT', () => {
		process.exit(0);
	});

	new StdioTransport(server).listen();
	console.error('Omnisearch MCP server running on stdio');
}
