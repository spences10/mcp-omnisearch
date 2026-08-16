import { McpServer } from 'tmcp';
import type { GenericSchema } from 'valibot';
import * as v from 'valibot';
import { apply_search_quality } from '../../common/quality.js';
import { SearchProvider } from '../../common/types.js';
import { get_quality_settings } from '../../config/env.js';
import {
	web_search_provider_definitions,
	type WebSearchProviderName,
} from '../provider-definitions.js';
import { ProviderRegistry } from '../provider-registry.js';
import { handle_tool_result } from './responses.js';
import {
	allowed_domains_schema,
	blocked_domains_schema,
	exclude_domains_schema,
	filter_spam_schema,
	include_domains_schema,
	large_result_mode_schema,
	limit_schema,
	max_results_per_domain_schema,
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

export const register_web_search = (
	server: McpServer<GenericSchema>,
) => {
	if (providers.size === 0) return;

	const provider_names = providers.ids() as WebSearchProviderName[];

	server.tool(
		{
			name: 'web_search',
			description:
				'Search the web for information. Use when you need to find web pages, articles, or data. Providers: tavily (factual/citations), brave (privacy/operators), kagi (quality/operators), exa (AI-semantic), kagi_enrichment (specialized indexes). Brave/Kagi support query operators like site:, filetype:, lang:, before:, after:. Known content mirrors are filtered by default and results are capped per registrable domain; disable with filter_spam=false or max_results_per_domain=0. site: and include_domains queries are exempt.',
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
				filter_spam: filter_spam_schema,
				max_results_per_domain: max_results_per_domain_schema,
				blocked_domains: blocked_domains_schema,
				allowed_domains: allowed_domains_schema,
				large_result_mode: large_result_mode_schema,
			}),
		},
		async ({
			query,
			provider,
			limit,
			include_domains,
			exclude_domains,
			filter_spam,
			max_results_per_domain,
			blocked_domains,
			allowed_domains,
			large_result_mode,
		}) =>
			handle_tool_result(
				'web_search',
				async () => {
					const selected = providers.require(provider, 'web_search');
					const settings = get_quality_settings();
					const results = await selected.search({
						query,
						limit,
						include_domains,
						exclude_domains,
					});

					return apply_search_quality(results, {
						query,
						include_domains,
						filter_spam: filter_spam ?? settings.filter_spam,
						max_results_per_domain:
							max_results_per_domain ??
							settings.max_results_per_domain,
						blocked_domains: [
							...settings.blocked_domains,
							...(blocked_domains ?? []),
						],
						allowed_domains: [
							...settings.allowed_domains,
							...(allowed_domains ?? []),
						],
					});
				},
				{ large_result_mode },
			),
	);
};
