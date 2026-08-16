import * as v from 'valibot';
import {
	handle_provider_error,
	sanitize_query,
} from '../../../common/errors.js';
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

const parallel_search_response_schema = v.object({
	results: v.array(
		v.object({
			url: v.string(),
			title: v.optional(v.nullable(v.string())),
			excerpts: v.optional(v.array(v.string())),
			publish_date: v.optional(v.nullable(v.string())),
		}),
	),
});

interface ParallelSearchRequest {
	objective: string;
	search_queries: string[];
	mode: 'basic';
	advanced_settings?: {
		source_policy?: {
			include_domains?: string[];
			exclude_domains?: string[];
		};
	};
}

export class ParallelSearchProvider implements SearchProvider {
	name = 'parallel';
	description =
		'LLM-ready web search with long excerpts from Parallel. Uses the cheaper basic mode by default because advanced search pricing can be surprising. Best when you need dense source excerpts. Supports include_domains/exclude_domains via source_policy.';

	async search(params: BaseSearchParams): Promise<SearchResult[]> {
		const api_key = validate_api_key(
			config.search.parallel.api_key,
			this.name,
		);

		const parsed_query = parse_search_operators(params.query);
		const search_params = apply_search_operators(parsed_query);

		const search_request = async () => {
			try {
				const include_domains = [
					...(params.include_domains ?? []),
					...(search_params.include_domains ?? []),
				];
				const exclude_domains = [
					...(params.exclude_domains ?? []),
					...(search_params.exclude_domains ?? []),
				];
				const query = sanitize_query(
					build_query_with_operators({
						...search_params,
						include_domains: undefined,
						exclude_domains: undefined,
					}),
				);
				const request_body: ParallelSearchRequest = {
					objective: query.slice(0, 5000),
					search_queries: [query.slice(0, 200)],
					mode: 'basic',
				};

				if (
					include_domains.length > 0 ||
					exclude_domains.length > 0
				) {
					request_body.advanced_settings = {
						source_policy: {
							...(include_domains.length > 0
								? { include_domains }
								: {}),
							...(exclude_domains.length > 0
								? { exclude_domains }
								: {}),
						},
					};
				}

				const raw_data = await http_json(
					this.name,
					`${config.search.parallel.base_url}/v1/search`,
					{
						method: 'POST',
						headers: {
							Accept: 'application/json',
							'Content-Type': 'application/json',
							'x-api-key': api_key,
						},
						body: JSON.stringify(request_body),
						signal: AbortSignal.timeout(
							config.search.parallel.timeout,
						),
					},
				);
				const data = parse_provider_response(
					this.name,
					parallel_search_response_schema,
					raw_data,
				);

				return data.results
					.slice(0, params.limit ?? 10)
					.map((result) => ({
						title: result.title ?? result.url,
						url: result.url,
						snippet: (result.excerpts ?? []).join('\n\n'),
						source_provider: this.name,
						metadata: result.publish_date
							? { date: result.publish_date }
							: undefined,
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
