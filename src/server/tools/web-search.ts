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
	web_search_provider_definitions,
	type WebSearchProviderName,
} from '../provider-definitions.js';
import { ProviderRegistry } from '../provider-registry.js';
import { handle_tool_result } from './responses.js';
import {
	exclude_domains_schema,
	include_domains_schema,
	large_result_mode_schema,
	limit_schema,
	query_schema,
} from './schemas.js';

const providers = new ProviderRegistry<SearchProvider>();
const health = new ProviderHealthTracker();

const provider_retry = {
	max_retries: 0,
} as const;

export const initialize_web_search = (): boolean => {
	providers.clear();
	health.clear();
	providers.register_all(web_search_provider_definitions);

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
	const selected = providers.require(provider, 'web_search');

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
			tool_name: 'web_search',
		},
	);

	return to_auto_route_result(outcome);
};

export const register_web_search = (
	server: McpServer<GenericSchema>,
) => {
	if (providers.size === 0) return;

	const provider_names = providers.ids() as WebSearchProviderName[];

	server.tool(
		{
			name: 'web_search',
			description:
				'Search the web for information. Use when you need to find web pages, articles, or data. Providers: tavily (factual/citations), brave (privacy/operators), kagi (quality/operators), exa (AI-semantic), kagi_enrichment (specialized indexes). Brave/Kagi support query operators like site:, filetype:, lang:, before:, after:. Omit provider to auto-route with failover; an explicit provider fails hard.',
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
							'Search provider to use. Omit to auto-route across configured providers with retry-then-failover. An explicit provider is forced and fails hard if that provider is down.',
						),
					),
				),
				limit: limit_schema,
				include_domains: include_domains_schema,
				exclude_domains: exclude_domains_schema,
				large_result_mode: large_result_mode_schema,
			}),
		},
		async ({
			query,
			provider,
			limit,
			include_domains,
			exclude_domains,
			large_result_mode,
		}) =>
			handle_tool_result(
				'web_search',
				async () => {
					const params = {
						query,
						limit,
						include_domains,
						exclude_domains,
					};

					if (provider) {
						return search_explicit(provider, params);
					}

					return search_auto(params);
				},
				{ large_result_mode },
			),
	);
};
