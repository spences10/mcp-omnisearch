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
	ErrorType,
	ProviderError,
	SearchProvider,
	SearchResult,
} from '../../../common/types.js';
import { validate_api_key } from '../../../common/validation.js';
import { config } from '../../../config/env.js';

const querit_search_response_schema = v.object({
	error_code: v.optional(v.number()),
	error_msg: v.optional(v.string()),
	results: v.optional(
		v.object({
			result: v.optional(
				v.array(
					v.object({
						url: v.optional(v.string()),
						title: v.optional(v.string()),
						snippet: v.optional(v.string()),
						page_age: v.optional(v.string()),
						site_name: v.optional(v.string()),
					}),
				),
			),
		}),
	),
});

const querit_languages: Record<string, string> = {
	en: 'english',
	english: 'english',
	ja: 'japanese',
	jp: 'japanese',
	japanese: 'japanese',
	ko: 'korean',
	korean: 'korean',
	de: 'german',
	german: 'german',
	fr: 'french',
	french: 'french',
	es: 'spanish',
	spanish: 'spanish',
	pt: 'portuguese',
	portuguese: 'portuguese',
};

const querit_countries: Record<string, string> = {
	ar: 'argentina',
	argentina: 'argentina',
	au: 'australia',
	australia: 'australia',
	br: 'brazil',
	brazil: 'brazil',
	ca: 'canada',
	canada: 'canada',
	co: 'colombia',
	colombia: 'colombia',
	fr: 'france',
	france: 'france',
	de: 'germany',
	germany: 'germany',
	in: 'india',
	india: 'india',
	id: 'indonesia',
	indonesia: 'indonesia',
	jp: 'japan',
	japan: 'japan',
	mx: 'mexico',
	mexico: 'mexico',
	ng: 'nigeria',
	nigeria: 'nigeria',
	ph: 'philippines',
	philippines: 'philippines',
	kr: 'south korea',
	'south korea': 'south korea',
	es: 'spain',
	spain: 'spain',
	gb: 'united kingdom',
	uk: 'united kingdom',
	'united kingdom': 'united kingdom',
	us: 'united states',
	usa: 'united states',
	'united states': 'united states',
};

const normalize_querit_date = (date: string) => {
	if (/^\d{4}$/.test(date)) return `${date}-01-01`;
	if (/^\d{4}-\d{2}$/.test(date)) return `${date}-01`;
	return date;
};

const map_querit_time_range = (
	date_after?: string,
	date_before?: string,
) => {
	if (date_after && date_before) {
		return `${normalize_querit_date(date_after)}to${normalize_querit_date(date_before)}`;
	}
	if (date_after) {
		const today = new Date().toISOString().slice(0, 10);
		return `${normalize_querit_date(date_after)}to${today}`;
	}
	return undefined;
};

export class QueritSearchProvider implements SearchProvider {
	name = 'querit';
	description =
		'Multilingual and real-time web search from Querit. Best for international queries. Translates site:/ -site:, lang:, loc:, and before:/after: into Querit filters.';

	async search(params: BaseSearchParams): Promise<SearchResult[]> {
		const api_key = validate_api_key(
			config.search.querit.api_key,
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
				const language = search_params.language
					? querit_languages[search_params.language.toLowerCase()]
					: undefined;
				const country = search_params.location
					? querit_countries[
							search_params.location
								.toLowerCase()
								.replace(/[_-]+/g, ' ')
						]
					: undefined;
				const time_range = map_querit_time_range(
					search_params.date_after,
					search_params.date_before,
				);

				const filters: Record<string, unknown> = {};
				if (
					include_domains.length > 0 ||
					exclude_domains.length > 0
				) {
					filters.sites = {
						...(include_domains.length > 0
							? { include: include_domains }
							: {}),
						...(exclude_domains.length > 0
							? { exclude: exclude_domains }
							: {}),
					};
				}
				if (language) {
					filters.languages = { include: [language] };
				}
				if (country) {
					filters.geo = { countries: { include: [country] } };
				}
				if (time_range) {
					filters.timeRange = { date: time_range };
				}

				const raw_data = await http_json(
					this.name,
					`${config.search.querit.base_url}/v1/search`,
					{
						method: 'POST',
						headers: {
							Accept: 'application/json',
							Authorization: `Bearer ${api_key}`,
							'Content-Type': 'application/json',
						},
						body: JSON.stringify({
							query: sanitize_query(
								build_query_with_operators({
									...search_params,
									include_domains: undefined,
									exclude_domains: undefined,
									language: language
										? undefined
										: search_params.language,
									location: country
										? undefined
										: search_params.location,
									date_after: time_range
										? undefined
										: search_params.date_after,
									date_before: time_range
										? undefined
										: search_params.date_before,
								}),
							),
							count: params.limit ?? 10,
							...(Object.keys(filters).length > 0 ? { filters } : {}),
						}),
						signal: AbortSignal.timeout(config.search.querit.timeout),
					},
				);
				const data = parse_provider_response(
					this.name,
					querit_search_response_schema,
					raw_data,
				);

				if (data.error_code && data.error_code !== 200) {
					throw new ProviderError(
						ErrorType.PROVIDER_ERROR,
						data.error_msg ||
							`Querit returned error_code ${data.error_code}`,
						this.name,
						{ code: String(data.error_code) },
					);
				}

				return (data.results?.result ?? [])
					.filter((result) => Boolean(result.url))
					.map((result) => {
						const metadata = {
							...(result.page_age ? { date: result.page_age } : {}),
							...(result.site_name
								? { site_name: result.site_name }
								: {}),
						};

						return {
							title: result.title ?? result.url ?? '',
							url: result.url ?? '',
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
