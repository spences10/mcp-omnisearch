import { McpServer } from 'tmcp';
import type { GenericSchema } from 'valibot';
import * as v from 'valibot';
import {
	is_failover_eligible,
	run_with_provider_failover,
	to_auto_route_result,
} from '../../common/provider-failover.js';
import {
	decorate_status_with_health,
	ProviderHealthTracker,
} from '../../common/provider-health.js';
import {
	BaseSearchParams,
	SearchProvider,
} from '../../common/types.js';
import {
	ai_search_provider_definitions,
	type AISearchProviderName,
} from '../provider-definitions.js';
import { ProviderRegistry } from '../provider-registry.js';
import { handle_tool_result } from './responses.js';
import {
	large_result_mode_schema,
	limit_schema,
	query_schema,
} from './schemas.js';

const providers = new ProviderRegistry<SearchProvider>();
const health = new ProviderHealthTracker();

const provider_retry = {
	max_retries: 0,
} as const;

export const initialize_ai_search = (): boolean => {
	providers.clear();
	health.clear();
	providers.register_all(ai_search_provider_definitions);

	return providers.size > 0;
};

export const get_available_providers = () => providers.names();

export const get_provider_status_entries = () =>
	providers
		.status_entries()
		.map((status) => decorate_status_with_health(status, health));

const search_explicit = async (
	provider: string,
	params: BaseSearchParams,
) => {
	const selected = providers.require(provider, 'ai_search');

	try {
		const results = await selected.search(params);
		health.record_success(provider);
		return results;
	} catch (error) {
		if (is_failover_eligible(error)) {
			health.record_failure(provider, error);
		}
		throw error;
	}
};

const search_auto = async (params: BaseSearchParams) => {
	const outcome = await run_with_provider_failover(
		providers.entries().map((entry) => ({
			id: entry.id,
			run: () => entry.instance.search(params),
		})),
		{
			health,
			retry: provider_retry,
			tool_name: 'ai_search',
		},
	);

	return to_auto_route_result(outcome);
};

export const register_ai_search = (
	server: McpServer<GenericSchema>,
) => {
	if (providers.size === 0) return;

	const provider_names = providers.ids() as AISearchProviderName[];

	server.tool(
		{
			name: 'ai_search',
			description:
				'Get AI-powered answers with citations and reasoning. Use when you need synthesized answers rather than raw search results. Providers: kagi_fastgpt (fast ~900ms answers), exa_answer (semantic AI), linkup (deep agentic search with sources). Omit provider to auto-route with failover; an explicit provider fails hard.',
			annotations: {
				readOnlyHint: true,
				destructiveHint: false,
				idempotentHint: true,
				openWorldHint: true,
			},
			schema: v.object({
				query: query_schema,
				provider: v.optional(
					v.pipe(
						v.picklist(provider_names),
						v.description(
							'AI search provider to use. Omit to auto-route across configured providers with retry-then-failover. An explicit provider is forced and fails hard if that provider is down.',
						),
					),
				),
				limit: limit_schema,
				large_result_mode: large_result_mode_schema,
			}),
		},
		async ({ query, provider, limit, large_result_mode }) =>
			handle_tool_result(
				'ai_search',
				async () => {
					const params = { query, limit };

					if (provider) {
						return search_explicit(provider, params);
					}

					return search_auto(params);
				},
				{ large_result_mode },
			),
	);
};
