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
	results: v.object({
		web: v.optional(
			v.array(
				v.object({
					title: v.string(),
					url: v.string(),
					description: v.optional(v.string()),
					snippets: v.optional(v.array(v.string())),
				}),
			),
		),
		news: v.optional(
			v.array(
				v.object({
					title: v.string(),
					url: v.string(),
					description: v.optional(v.string()),
					snippets: v.optional(v.array(v.string())),
				}),
			),
		),
	}),
});

export class YouComSearchProvider implements SearchProvider {
	name = 'youcom';
	description =
		'You.com Search API for fresh web and news results. Best when you want raw search results to feed into another ranking, synthesis, or browsing step. Supports query operators by passing them through unchanged.';

	async search(params: BaseSearchParams): Promise<SearchResult[]> {
		const api_key = validate_api_key(config.youcom.api_key, this.name);
		const parsed_query = parse_search_operators(params.query);
		const search_params = apply_search_operators(parsed_query);

		const search_request = async () => {
			try {
				const query = build_query_with_operators(
					search_params,
					params.include_domains,
					params.exclude_domains,
				);

				const query_params = new URLSearchParams({
					query,
					count: (params.limit ?? 10).toString(),
				});

				const raw_data = await http_json(
					this.name,
					`${config.youcom.base_url}/v1/search?${query_params}`,
					{
						method: 'GET',
						headers: {
							Accept: 'application/json',
							'X-API-Key': api_key,
						},
						signal: AbortSignal.timeout(config.youcom.timeout),
					},
				);

				const data = parse_provider_response(
					this.name,
					youcom_search_response_schema,
					raw_data,
				);

				const web_results = (data.results.web ?? []).map((result) => ({
					title: result.title,
					url: result.url,
					snippet: result.description ?? result.snippets?.[0] ?? '',
					source_provider: this.name,
				}));
				const news_results = (data.results.news ?? []).map((result) => ({
					title: result.title,
					url: result.url,
					snippet: result.description ?? result.snippets?.[0] ?? '',
					source_provider: this.name,
				}));

				return [...web_results, ...news_results].slice(0, params.limit ?? 10);
			} catch (error) {
				handle_provider_error(error, this.name, 'fetch search results');
			}
		};

		return retry_with_backoff(search_request);
	}
}
