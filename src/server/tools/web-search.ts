import { McpServer } from 'tmcp';
import type { GenericSchema } from 'valibot';
import * as v from 'valibot';
import { SearchProvider } from '../../common/types.js';
import {
	web_search_provider_definitions,
	type WebSearchProviderName,
} from '../provider-definitions.js';
import { ProviderRegistry } from '../provider-registry.js';
import {
	run_research_mode,
	select_research_extract_provider,
} from './research-mode.js';
import { handle_tool_result } from './responses.js';
import {
	exclude_domains_schema,
	include_domains_schema,
	large_result_mode_schema,
	limit_schema,
	query_schema,
	research_extract_count_schema,
	research_extract_schema,
	research_time_budget_schema,
	search_mode_schema,
} from './schemas.js';
import { get_registered_extract_providers } from './web-extract.js';

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
				'Search the web for information. Use when you need to find web pages, articles, or data. Providers: tavily (factual/citations), brave (privacy/operators), kagi (quality/operators), exa (AI-semantic), kagi_enrichment (specialized indexes). Brave/Kagi support query operators like site:, filetype:, lang:, before:, after:. Optional mode=research fans out to several configured search providers and may extract top URLs under research_time_budget (default 55s). Default remains single-provider.',
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
				large_result_mode: large_result_mode_schema,
				mode: search_mode_schema,
				research_time_budget: research_time_budget_schema,
				research_extract: research_extract_schema,
				research_extract_count: research_extract_count_schema,
			}),
		},
		async ({
			query,
			provider,
			limit,
			include_domains,
			exclude_domains,
			large_result_mode,
			mode,
			research_time_budget,
			research_extract,
			research_extract_count,
		}) =>
			handle_tool_result(
				'web_search',
				async () => {
					if (mode === 'research') {
						return run_research_mode(
							{
								query,
								limit,
								include_domains,
								exclude_domains,
								preferred_provider: provider,
								time_budget_seconds: research_time_budget,
								extract: research_extract,
								extract_count: research_extract_count,
							},
							providers.entries().map((entry) => ({
								id: entry.id,
								capabilities: entry.capabilities,
								search: (params) => entry.instance.search(params),
							})),
							select_research_extract_provider(
								get_registered_extract_providers(),
							),
						);
					}

					const selected = providers.require(provider, 'web_search');

					return selected.search({
						query,
						limit,
						include_domains,
						exclude_domains,
					});
				},
				{ large_result_mode },
			),
	);
};
