import { McpServer } from 'tmcp';
import type { GenericSchema } from 'valibot';
import * as v from 'valibot';
import { merge_search_result_lists } from '../../common/rrf-merge.js';
import {
	SearchProvider,
	type SearchResult,
} from '../../common/types.js';
import { get_rrf_k } from '../../config/env.js';
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

export const initialize_web_search = (): boolean => {
	providers.clear();
	providers.register_all(web_search_provider_definitions);

	return providers.size > 0;
};

export const get_available_providers = () => providers.names();

export const get_provider_status_entries = () =>
	providers.status_entries();

// Thin hook for current single-list calls and future fan-out
// (#188). One list stays a plain SearchResult[]; several lists
// are fused with RRF, URL/title identity, and sources[].
export const merge_web_search_results = (
	lists: readonly SearchResult[][],
	options: { limit?: number } = {},
) =>
	merge_search_result_lists(lists, {
		k: get_rrf_k(),
		limit: options.limit,
	});

export const register_web_search = (
	server: McpServer<GenericSchema>,
) => {
	if (providers.size === 0) return;

	const provider_names = providers.ids() as WebSearchProviderName[];

	server.tool(
		{
			name: 'web_search',
			description:
				'Search the web for information. Use when you need to find web pages, articles, or data. Providers: tavily (factual/citations), brave (privacy/operators), kagi (quality/operators), exa (AI-semantic), kagi_enrichment (specialized indexes). Brave/Kagi support query operators like site:, filetype:, lang:, before:, after:.',
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
					const selected = providers.require(provider, 'web_search');

					return merge_web_search_results(
						[
							await selected.search({
								query,
								limit,
								include_domains,
								exclude_domains,
							}),
						],
						{ limit },
					);
				},
				{ large_result_mode },
			),
	);
};
