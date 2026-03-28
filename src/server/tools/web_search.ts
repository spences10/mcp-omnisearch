import { McpServer } from 'tmcp';
import type { GenericSchema } from 'valibot';
import * as v from 'valibot';
import { create_error_response } from '../../common/errors.js';
import { handle_large_result } from '../../common/results.js';
import {
	ErrorType,
	ProviderError,
	SearchProvider,
} from '../../common/types.js';
import { is_api_key_valid } from '../../common/validation.js';

// Concrete provider imports
import { config } from '../../config/env.js';
import { KagiEnrichmentSearchProvider } from '../../providers/enhancement/kagi_enrichment/index.js';
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

const providers = new Map<string, SearchProvider>();

export const initialize_web_search = (): boolean => {
	if (is_api_key_valid(config.search.tavily.api_key, 'tavily'))
		providers.set('tavily', new TavilySearchProvider());
	if (is_api_key_valid(config.search.brave.api_key, 'brave'))
		providers.set('brave', new BraveSearchProvider());
	if (is_api_key_valid(config.search.kagi.api_key, 'kagi'))
		providers.set('kagi', new KagiSearchProvider());
	if (is_api_key_valid(config.search.exa.api_key, 'exa'))
		providers.set('exa', new ExaSearchProvider());
	if (
		is_api_key_valid(
			config.enhancement.kagi_enrichment.api_key,
			'kagi_enrichment',
		)
	)
		providers.set(
			'kagi_enrichment',
			new KagiEnrichmentSearchProvider(),
		);

	return providers.size > 0;
};

export const get_available_providers = () =>
	Array.from(providers.keys());

export const register_web_search = (
	server: McpServer<GenericSchema>,
) => {
	if (providers.size === 0) return;

	const provider_names = Array.from(
		providers.keys(),
	) as WebSearchProviderName[];

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
				query: v.pipe(v.string(), v.description('Search query')),
				provider: v.pipe(
					v.picklist(provider_names),
					v.description('Search provider to use'),
				),
				limit: v.optional(
					v.pipe(
						v.number(),
						v.description('Maximum number of results (default: 10)'),
					),
				),
				include_domains: v.optional(
					v.pipe(
						v.array(v.string()),
						v.description('Only return results from these domains'),
					),
				),
				exclude_domains: v.optional(
					v.pipe(
						v.array(v.string()),
						v.description('Exclude results from these domains'),
					),
				),
			}),
		},
		async ({
			query,
			provider,
			limit,
			include_domains,
			exclude_domains,
		}) => {
			try {
				const selected = providers.get(provider);
				if (!selected) {
					throw new ProviderError(
						ErrorType.INVALID_INPUT,
						`Provider "${provider}" is not available. Available: ${Array.from(providers.keys()).join(', ')}`,
						'web_search',
					);
				}

				const results = await selected.search({
					query,
					limit,
					include_domains,
					exclude_domains,
				});
				const safe_results = handle_large_result(
					results,
					'web_search',
				);
				return {
					content: [
						{
							type: 'text' as const,
							text: JSON.stringify(safe_results, null, 2),
						},
					],
				};
			} catch (error) {
				const error_response = create_error_response(error as Error);
				return {
					content: [
						{
							type: 'text' as const,
							text: error_response.error,
						},
					],
					isError: true,
				};
			}
		},
	);
};
