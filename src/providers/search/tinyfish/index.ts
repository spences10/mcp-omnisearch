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

const tinyfish_search_response_schema = v.object({
	results: v.optional(
		v.array(
			v.object({
				title: v.optional(v.string()),
				url: v.string(),
				snippet: v.optional(v.string()),
				site_name: v.optional(v.string()),
				date: v.optional(v.string()),
				publisher: v.optional(v.string()),
			}),
		),
	),
});

const normalize_tinyfish_date = (date: string) => {
	if (/^\d{4}$/.test(date)) return `${date}-01-01`;
	if (/^\d{4}-\d{2}$/.test(date)) return `${date}-01`;
	return date;
};

export class TinyFishSearchProvider implements SearchProvider {
	name = 'tinyfish';
	description =
		'Source-only web and news search from TinyFish. Best for ranked titles, snippets, and URLs without extraction. Translates site:/ -site:, lang:, loc:, and before:/after: into TinyFish query parameters.';

	async search(params: BaseSearchParams): Promise<SearchResult[]> {
		const api_key = validate_api_key(
			config.search.tinyfish.api_key,
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
				const query_params = new URLSearchParams({
					query: sanitize_query(
						build_query_with_operators({
							...search_params,
							include_domains: undefined,
							exclude_domains: undefined,
							language: undefined,
							location: undefined,
							date_after: undefined,
							date_before: undefined,
						}),
					),
					domain_type: 'web',
				});

				if (include_domains.length > 0) {
					query_params.set(
						'include_domains',
						include_domains.join(','),
					);
				}
				if (exclude_domains.length > 0) {
					query_params.set(
						'exclude_domains',
						exclude_domains.join(','),
					);
				}
				if (search_params.location) {
					query_params.set(
						'location',
						search_params.location.toUpperCase(),
					);
				}
				if (search_params.language) {
					query_params.set(
						'language',
						search_params.language.toLowerCase(),
					);
				}
				if (search_params.date_after) {
					query_params.set(
						'after_date',
						normalize_tinyfish_date(search_params.date_after),
					);
				}
				if (search_params.date_before) {
					query_params.set(
						'before_date',
						normalize_tinyfish_date(search_params.date_before),
					);
				}

				const raw_data = await http_json(
					this.name,
					`${config.search.tinyfish.base_url}?${query_params}`,
					{
						method: 'GET',
						headers: {
							Accept: 'application/json',
							'X-API-Key': api_key,
						},
						signal: AbortSignal.timeout(
							config.search.tinyfish.timeout,
						),
					},
				);
				const data = parse_provider_response(
					this.name,
					tinyfish_search_response_schema,
					raw_data,
				);

				return (data.results ?? [])
					.slice(0, params.limit ?? 10)
					.map((result) => {
						const metadata = {
							...(result.site_name
								? { site_name: result.site_name }
								: {}),
							...(result.date ? { date: result.date } : {}),
							...(result.publisher
								? { publisher: result.publisher }
								: {}),
						};

						return {
							title: result.title ?? result.url,
							url: result.url,
							snippet: result.snippet ?? '',
							source_provider: this.name,
							...(Object.keys(metadata).length > 0
								? { metadata }
								: {}),
						};
					});
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
