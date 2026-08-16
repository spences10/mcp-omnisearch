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
import { config } from '../../../config/env.js';
import {
	keenable_endpoint,
	keenable_headers,
	keenable_search_public_url,
	keenable_search_url,
} from './auth.js';

const keenable_search_response_schema = v.object({
	results: v.optional(
		v.array(
			v.object({
				title: v.optional(v.string()),
				url: v.string(),
				description: v.optional(v.string()),
				snippet: v.optional(v.string()),
				published_at: v.optional(v.string()),
			}),
		),
	),
});

const normalize_keenable_date = (date: string) => {
	if (/^\d{4}$/.test(date)) return `${date}-01-01`;
	if (/^\d{4}-\d{2}$/.test(date)) return `${date}-01`;
	return date;
};

export class KeenableSearchProvider implements SearchProvider {
	name = 'keenable';
	description =
		'Independent web index search from Keenable. Best as an explicit fallback. Set KEENABLE_API_KEY for the keyed API, or opt into the shared public tier with KEENABLE_ALLOW_PUBLIC=1. Translates a single site: filter and before:/after: into site and published_* fields.';

	async search(params: BaseSearchParams): Promise<SearchResult[]> {
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
				const request_body: Record<string, unknown> = {
					query: sanitize_query(
						build_query_with_operators({
							...search_params,
							include_domains:
								include_domains.length === 1
									? undefined
									: include_domains,
							exclude_domains,
							date_after: undefined,
							date_before: undefined,
						}),
					),
				};

				if (include_domains.length === 1) {
					request_body.site = include_domains[0];
				}
				if (search_params.date_after) {
					request_body.published_after = normalize_keenable_date(
						search_params.date_after,
					);
				}
				if (search_params.date_before) {
					request_body.published_before = normalize_keenable_date(
						search_params.date_before,
					);
				}

				const raw_data = await http_json(
					this.name,
					keenable_endpoint(
						config.search.keenable.api_key,
						config.search.keenable.allow_public,
						keenable_search_url(config.search.keenable.base_url),
						keenable_search_public_url(
							config.search.keenable.base_url,
						),
					),
					{
						method: 'POST',
						headers: {
							...keenable_headers(
								this.name,
								config.search.keenable.api_key,
								config.search.keenable.allow_public,
							),
							'Content-Type': 'application/json',
						},
						body: JSON.stringify(request_body),
						signal: AbortSignal.timeout(
							config.search.keenable.timeout,
						),
					},
				);
				const data = parse_provider_response(
					this.name,
					keenable_search_response_schema,
					raw_data,
				);

				return (data.results ?? [])
					.slice(0, params.limit ?? 10)
					.map((result) => ({
						title: result.title ?? result.url,
						url: result.url,
						snippet: result.snippet ?? result.description ?? '',
						source_provider: this.name,
						metadata: result.published_at
							? { date: result.published_at }
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
