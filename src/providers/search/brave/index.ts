import { handle_provider_error } from '../../../common/errors.js';
import { http_json } from '../../../common/http.js';
import { retry_with_backoff } from '../../../common/retry.js';
import {
	apply_search_operators,
	build_query_with_operators,
	parse_search_operators,
} from '../../../common/search_operators.js';
import {
	BaseSearchParams,
	SearchProvider,
	SearchResult,
} from '../../../common/types.js';
import { validate_api_key } from '../../../common/validation.js';
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

		// Parse search operators from the query
		const parsed_query = parse_search_operators(params.query);
		const search_params = apply_search_operators(parsed_query);

		const search_request = async () => {
			try {
				// Build query with all operators using shared utility
				const query = build_query_with_operators(
					search_params,
					params.include_domains,
					params.exclude_domains,
				);

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
				handle_provider_error(
					error,
					this.name,
					'fetch search results',
				);
			}
		};

		return retry_with_backoff(search_request);
	}
}
