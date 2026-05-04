import { McpServer } from 'tmcp';
import type { GenericSchema } from 'valibot';
import * as v from 'valibot';
import { SearchProvider } from '../../common/types.js';
import { ProviderRegistry } from '../provider-registry.js';
import { handle_tool_result } from './responses.js';
import {
	exclude_domains_schema,
	include_domains_schema,
	large_result_mode_schema,
	limit_schema,
	query_schema,
} from './schemas.js';

// Concrete provider imports
import { config } from '../../config/env.js';
import { KagiEnrichmentSearchProvider } from '../../providers/enhancement/kagi-enrichment/index.js';
import { BraveSearchProvider } from '../../providers/search/brave/index.js';
import { ExaSearchProvider } from '../../providers/search/exa/index.js';
import { KagiSearchProvider } from '../../providers/search/kagi/index.js';
import { TavilySearchProvider } from '../../providers/search/tavily/index.js';

export type WebSearchProviderName =
	| 'tavily'
	| 'brave'
	| 'kagi'
	| 'exa'
	| 'kagi_enrichment';

const providers = new ProviderRegistry<SearchProvider>();

export const initialize_web_search = (): boolean => {
	providers.clear();
	providers.register({
		id: 'tavily',
		name: 'tavily',
		category: 'search',
		api_key: config.search.tavily.api_key,
		create: () => new TavilySearchProvider(),
	});
	providers.register({
		id: 'brave',
		name: 'brave',
		category: 'search',
		api_key: config.search.brave.api_key,
		create: () => new BraveSearchProvider(),
	});
	providers.register({
		id: 'kagi',
		name: 'kagi',
		category: 'search',
		api_key: config.search.kagi.api_key,
		create: () => new KagiSearchProvider(),
	});
	providers.register({
		id: 'exa',
		name: 'exa',
		category: 'search',
		api_key: config.search.exa.api_key,
		create: () => new ExaSearchProvider(),
	});
	providers.register({
		id: 'kagi_enrichment',
		name: 'kagi_enrichment',
		category: 'search',
		api_key: config.enhancement.kagi_enrichment.api_key,
		create: () => new KagiEnrichmentSearchProvider(),
	});

	return providers.size > 0;
};

export const get_available_providers = () => providers.names();

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
