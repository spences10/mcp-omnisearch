import { http_json } from '../../../common/http.js';
import {
	BaseSearchParams,
	ErrorType,
	ProviderError,
	SearchProvider,
	SearchResult,
} from '../../../common/types.js';
import {
	retry_with_backoff,
	sanitize_query,
	validate_api_key,
} from '../../../common/utils.js';
import { config } from '../../../config/env.js';

interface KagiSearchResponse {
	data: Array<{
		title: string;
		url: string;
		snippet: string;
		rank?: number;
	}>;
	meta?: {
		total_hits: number;
		api_balance?: number;
	};
}

export class KagiSearchProvider implements SearchProvider {
	name = 'kagi';
	description =
		'High-quality search with operators: site:, -site:, filetype:/ext:, intitle:, inurl:, inbody:, inpage:, lang:, loc:, before:, after:, +term, -term, "exact". Privacy-focused with specialized knowledge indexes. Best for research and technical documentation.';

	async search(params: BaseSearchParams): Promise<SearchResult[]> {
		const api_key = validate_api_key(
			config.search.kagi.api_key,
			this.name,
		);

		const search_request = async () => {
			try {
				// Use the original query as-is to preserve inline operators
				// This ensures operators like site:, filetype:, etc. work as hard filters
				let query = sanitize_query(params.query);
				const query_params = new URLSearchParams({
					q: query,
					limit: (params.limit ?? 10).toString(),
				});

				// Handle domain filters from params only (not from query operators)
				if (params.include_domains?.length) {
					const domain_filter = params.include_domains
						.map((domain) => `site:${domain}`)
						.join(' OR ');
					query = `${query} (${domain_filter})`;
				}

				if (params.exclude_domains?.length) {
					query = `${query} ${params.exclude_domains
						.map((domain) => `-site:${domain}`)
						.join(' ')}`;
				}

				// Update query parameter with domain filters from params
				query_params.set('q', query);

				const data = await http_json<
					KagiSearchResponse & { message?: string }
				>(
					this.name,
					`${config.search.kagi.base_url}/search?${query_params}`,
					{
						method: 'GET',
						headers: {
							Authorization: `Bot ${api_key}`,
							Accept: 'application/json',
						},
						signal: AbortSignal.timeout(config.search.kagi.timeout),
					},
				);

				return (data.data || []).map((result) => ({
					title: result.title,
					url: result.url,
					snippet: result.snippet,
					score: result.rank,
					source_provider: this.name,
				}));
			} catch (error) {
				if (error instanceof ProviderError) {
					throw error;
				}
				throw new ProviderError(
					ErrorType.API_ERROR,
					`Failed to fetch: ${
						error instanceof Error ? error.message : 'Unknown error'
					}`,
					this.name,
				);
			}
		};

		return retry_with_backoff(search_request);
	}
}
