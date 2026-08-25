import { McpServer } from 'tmcp';
import type { GenericSchema } from 'valibot';
import * as v from 'valibot';
import { SearchProvider } from '../../common/types.js';
import {
	web_search_provider_definitions,
	type WebSearchProviderName,
} from '../provider-definitions.js';
import { ProviderRegistry } from '../provider-registry.js';
import { handle_tool_result } from './responses.js';
import {
	exclude_domains_schema,
	include_domains_schema,
	include_raw_content_schema,
	large_result_mode_schema,
	limit_schema,
	query_schema,
	safe_search_schema,
	search_depth_schema,
	search_time_range_schema,
	search_topic_schema,
} from './schemas.js';

const providers = new ProviderRegistry<SearchProvider>();

export const initialize_web_search = (): boolean => {
	providers.clear();
	providers.register_all(web_search_provider_definitions);

	return providers.size > 0;
};

export const get_available_providers = () => providers.names();

export const get_provider_status_entries = () =>
	providers.status_entries();

export const register_web_search = (
	server: McpServer<GenericSchema>,
) => {
	if (providers.size === 0) return;

	const provider_names = providers.ids() as WebSearchProviderName[];

	server.tool(
		{
			name: 'web_search',
			description:
				'Search the web for information. Use when you need to find web pages, articles, or data. Providers: tavily (factual/citations and search controls), brave (privacy/operators), kagi (quality/operators), exa (AI-semantic), kagi_enrichment (specialized indexes). Search depth, topic, time range, safe search, and raw content apply when supported by the provider.',
			annotations: {
				readOnlyHint: true,
				destructiveHint: false,
				idempotentHint: true,
				openWorldHint: true,
			},
			schema: v.object({
				query: query_schema,
				provider: v.pipe(
					v.picklist(provider_names),
					v.description('Search provider to use'),
				),
				limit: limit_schema,
				include_domains: include_domains_schema,
				exclude_domains: exclude_domains_schema,
				search_depth: search_depth_schema,
				topic: search_topic_schema,
				time_range: search_time_range_schema,
				safe_search: safe_search_schema,
				include_raw_content: include_raw_content_schema,
				large_result_mode: large_result_mode_schema,
			}),
		},
		async ({
			query,
			provider,
			limit,
			include_domains,
			exclude_domains,
			search_depth,
			topic,
			time_range,
			safe_search,
			include_raw_content,
			large_result_mode,
		}) =>
			handle_tool_result(
				'web_search',
				async () => {
					const selected = providers.require(provider, 'web_search');

					return selected.search({
						query,
						limit,
						include_domains,
						exclude_domains,
						search_depth,
						topic,
						time_range,
						safe_search,
						include_raw_content,
					});
				},
				{ large_result_mode },
			),
	);
};
