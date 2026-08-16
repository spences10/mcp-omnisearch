import { McpServer } from 'tmcp';
import type { GenericSchema } from 'valibot';
import * as v from 'valibot';
import { list_provider_info } from '../provider-info.js';
import type { ProviderStatus } from '../provider-registry.js';
import { create_json_tool_response } from './responses.js';

export const register_provider_info = (
	server: McpServer<GenericSchema>,
	get_entries: () => readonly ProviderStatus[],
) => {
	server.tool(
		{
			name: 'get_provider_info',
			description:
				'List registered providers with non-secret runtime metadata: id, tools, timeout, enabled, cooldown, and last error type. Works with a subset of API keys. Does not return keys, tokens, or secrets.',
			annotations: {
				readOnlyHint: true,
				destructiveHint: false,
				idempotentHint: true,
				openWorldHint: false,
			},
			schema: v.object({
				provider: v.optional(
					v.pipe(
						v.string(),
						v.minLength(1, 'Provider cannot be empty'),
						v.description(
							'Optional provider id or name to filter the listing',
						),
					),
				),
			}),
		},
		async ({ provider }) =>
			create_json_tool_response({
				providers: list_provider_info(get_entries(), provider),
			}),
	);
};
