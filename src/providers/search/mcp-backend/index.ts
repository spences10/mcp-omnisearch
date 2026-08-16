import {
	handle_provider_error,
	sanitize_query,
} from '../../../common/errors.js';
import { call_mcp_tool } from '../../../common/mcp-client.js';
import {
	extract_result_list,
	map_mcp_search_results,
} from '../../../common/mcp-results.js';
import { retry_with_backoff } from '../../../common/retry.js';
import type {
	BaseSearchParams,
	SearchProvider,
	SearchResult,
} from '../../../common/types.js';
import {
	MCP_BACKENDS_ENV,
	load_mcp_backends,
	type ResolvedMcpBackend,
} from '../../../config/mcp-backends.js';
import type { ProviderDefinition } from '../../../server/provider-registry.js';

export type McpToolCaller = typeof call_mcp_tool;

export class McpBackendSearchProvider implements SearchProvider {
	name: string;
	description: string;
	estimated_cost: number;

	constructor(
		private readonly backend: ResolvedMcpBackend,
		private readonly call_tool: McpToolCaller = call_mcp_tool,
	) {
		this.name = backend.id;
		this.estimated_cost = backend.estimated_cost;
		this.description = `Downstream MCP search backend (${backend.kind}) calling ${backend.tool}. Estimated cost ${backend.estimated_cost}.`;
	}

	async search(params: BaseSearchParams): Promise<SearchResult[]> {
		const arguments_: Record<string, unknown> = {
			...this.backend.static_arguments,
			[this.backend.query_argument]: sanitize_query(params.query),
		};
		if (this.backend.limit_argument) {
			arguments_[this.backend.limit_argument] = params.limit ?? 5;
		}

		const search_request = async () => {
			try {
				const result = await this.call_tool({
					backend: this.backend,
					tool: this.backend.tool,
					arguments: arguments_,
				});
				const items = extract_result_list(
					result,
					this.backend.result_path,
					this.name,
				);
				return map_mcp_search_results(
					items,
					this.backend.field_aliases,
					this.name,
				);
			} catch (error) {
				handle_provider_error(
					error,
					this.name,
					'call downstream MCP tool',
				);
			}
		};

		return retry_with_backoff(search_request);
	}
}

export const create_mcp_backend_definitions = (
	env: NodeJS.ProcessEnv = process.env,
	reserved_ids?: readonly string[],
): ProviderDefinition<SearchProvider>[] =>
	load_mcp_backends(env, reserved_ids).map((backend) => ({
		id: backend.id,
		name: backend.id,
		category: 'search',
		api_key: undefined,
		api_key_name: MCP_BACKENDS_ENV,
		requires_api_key: false,
		tools: ['web_search'],
		capabilities: ['mcp_backend', 'web_search'],
		description: `Downstream MCP backend calling ${backend.tool}`,
		create: () => new McpBackendSearchProvider(backend),
	}));
