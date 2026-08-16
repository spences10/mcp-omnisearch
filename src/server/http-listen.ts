import { HttpTransport } from '@tmcp/transport-http';
import type { McpServer } from 'tmcp';
import type { GenericSchema } from 'valibot';
import type { HttpConfig } from '../config/http.js';
import {
	start_http_listener,
	type HttpServerHandle,
} from './http-server.js';

export const start_http_server = async (
	mcp_server: McpServer<GenericSchema>,
	config: HttpConfig,
): Promise<HttpServerHandle> => {
	const transport = new HttpTransport(mcp_server, {
		path: config.path,
	});
	const handle = await start_http_listener(config, (request) =>
		transport.respond(request),
	);

	return {
		port: handle.port,
		close: async () => {
			await transport.close();
			await handle.close();
		},
	};
};
