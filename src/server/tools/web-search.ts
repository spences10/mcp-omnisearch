import { McpServer } from 'tmcp';
import type { GenericSchema } from 'valibot';
import {
	ErrorType,
	ProviderError,
	SearchProvider,
} from '../../common/types.js';
import { config } from '../../config/env.js';
import {
	web_search_provider_definitions,
	type WebSearchProviderName,
} from '../provider-definitions.js';
import { ProviderRegistry } from '../provider-registry.js';
import { handle_tool_result } from './responses.js';
import { create_web_search_schema } from './schemas.js';
import {
	resolve_configured_providers,
	search_providers_concurrently,
} from './web-search-fanout.js';

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

	const provider_names = providers.ids() as [
		WebSearchProviderName,
		...WebSearchProviderName[],
	];

	server.tool(
		{
			name: 'web_search',
			description:
				'Search the web for information. Use when you need to find web pages, articles, or data. Providers: tavily (factual/citations), brave (privacy/operators), kagi (quality/operators), exa (AI-semantic), kagi_enrichment (specialized indexes). Brave/Kagi support query operators like site:, filetype:, lang:, before:, after:. Pass provider for a single engine. Pass providers to run selected configured engines concurrently under one timeout; missing keys are skipped. Do not send both.',
			annotations: {
				readOnlyHint: true,
				destructiveHint: false,
				idempotentHint: true,
				openWorldHint: true,
			},
			schema: create_web_search_schema(provider_names),
		},
		async ({
			query,
			provider,
			providers: requested_providers,
			limit,
			include_domains,
			exclude_domains,
			large_result_mode,
		}) =>
			handle_tool_result(
				'web_search',
				async () => {
					const search_params = {
						query,
						limit,
						include_domains,
						exclude_domains,
					};

					if (requested_providers) {
						const selected = resolve_configured_providers(
							requested_providers,
							(id) => providers.get(id),
						);

						if (selected.length === 0) {
							throw new ProviderError(
								ErrorType.INVALID_INPUT,
								`None of the requested providers are configured: ${requested_providers.join(', ')}. Available: ${providers.ids().join(', ')}`,
								'web_search',
							);
						}

						return search_providers_concurrently(
							selected,
							search_params,
							config.search.fanout.timeout,
						);
					}

					const selected = providers.require(
						provider as WebSearchProviderName,
						'web_search',
					);

					return selected.search(search_params);
				},
				{ large_result_mode },
			),
	);
};
