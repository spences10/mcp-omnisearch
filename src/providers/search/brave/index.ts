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

interface BraveSearchResponse {
	web: {
		results: Array<{
			title: string;
			url: string;
			description: string;
		}>;
	};
}

export class BraveSearchProvider implements SearchProvider {
	name = 'brave';
	description =
		'Privacy-focused search with operators: site:, -site:, filetype:/ext:, intitle:, inurl:, inbody:, inpage:, lang:, loc:, before:, after:, +term, -term, "exact". Best for technical content and privacy-sensitive queries.';

	async search(params: BaseSearchParams): Promise<SearchResult[]> {
		const api_key = validate_api_key(
			config.search.brave.api_key,
			this.name,
		);

		const search_request = async () => {
			try {
				// Use the original query as-is to preserve inline operators
				// This ensures operators like site:, filetype:, etc. work as hard filters
				let query = sanitize_query(params.query);

				// Build operator filters only from params (not from query string)
				const filters: string[] = [];

				// Handle domain filters from params only (not from query operators)
				if (params.include_domains?.length) {
					const domain_filter = params.include_domains
						.map((domain) => `site:${domain}`)
						.join(' OR ');
					filters.push(`(${domain_filter})`);
				}

				if (params.exclude_domains?.length) {
					filters.push(
						...params.exclude_domains.map(
							(domain) => `-site:${domain}`,
						),
					);
				}

				// Combine query with filters from params
				if (filters.length > 0) {
					query = `${query} ${filters.join(' ')}`;
				}

				const query_params = new URLSearchParams({
					q: query,
					count: (params.limit ?? 10).toString(),
				});

				const data = await http_json<
					BraveSearchResponse & { message?: string }
				>(
					this.name,
					`${config.search.brave.base_url}/web/search?${query_params}`,
					{
						method: 'GET',
						headers: {
							Accept: 'application/json',
							'X-Subscription-Token': api_key,
						},
						signal: AbortSignal.timeout(config.search.brave.timeout),
					},
				);

				return (data.web?.results || []).map((result) => ({
					title: result.title,
					url: result.url,
					snippet: result.description,
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
