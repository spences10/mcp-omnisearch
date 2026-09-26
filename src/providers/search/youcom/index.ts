import * as v from 'valibot';
import { handle_provider_error } from '../../../common/errors.js';
import { http_json } from '../../../common/http.js';
import { parse_provider_response } from '../../../common/provider-response.js';
import { retry_with_backoff } from '../../../common/retry.js';
import {
	apply_search_operators,
	build_query_with_operators,
	parse_search_operators,
} from '../../../common/search-operators.js';
import {
	BaseSearchParams,
	SearchProvider,
	SearchResult,
} from '../../../common/types.js';
import { validate_api_key } from '../../../common/validation.js';
import { config } from '../../../config/env.js';

const youcom_search_response_schema = v.object({
	results: v.array(
		v.object({
			title: v.string(),
			url: v.string(),
			snippet: v.string(),
		}),
	),
});

export class YoucomSearchProvider implements SearchProvider {
	name = 'youcom';
	description =
		'Real-time web search using the You.com Search API. Best for current events, general knowledge, and cited factual queries. Free tier available with API key at you.com/platform/api-keys. Supports domain filters via query operators.';

	async search(params: BaseSearchParams): Promise<SearchResult[]> {
		const api_key = validate_api_key(
			config.search.youcom.api_key,
			this.name,
		);

		// Parse search operators from the query
		const parsed_query = parse_search_operators(params.query);
		const search_params = apply_search_operators(parsed_query);

		const search_request = async () => {
			try {
				const query = build_query_with_operators(
					search_params,
					params.include_domains,
					params.exclude_domains,
				);

				const search_payload = {
					q: query,
					count: params.limit ?? 10,
				};

				const raw_data = await http_json(
					this.name,
					`${config.search.youcom.base_url}/v1/search`,
					{
						method: 'POST',
						headers: {
							'Content-Type': 'application/json',
							Accept: 'application/json',
							Authorization: `Bearer ${api_key}`,
						},
						body: JSON.stringify(search_payload),
						signal: AbortSignal.timeout(
							config.search.youcom.timeout,
						),
					},
				);

				const data = parse_provider_response(
					this.name,
					youcom_search_response_schema,
					raw_data,
				);

				return data.results.map((result) => ({
					title: result.title,
					url: result.url,
					snippet: result.snippet,
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