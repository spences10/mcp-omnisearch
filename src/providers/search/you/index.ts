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

const you_result_schema = v.object({
	title: v.optional(v.string()),
	url: v.string(),
	description: v.optional(v.string()),
	snippets: v.optional(v.array(v.string())),
});

const you_search_response_schema = v.object({
	results: v.optional(
		v.union([
			v.array(you_result_schema),
			v.object({
				web: v.optional(v.array(you_result_schema)),
				news: v.optional(v.array(you_result_schema)),
			}),
		]),
	),
});

interface YouSearchRequest {
	query: string;
	count: number;
	include_domains?: string[];
	exclude_domains?: string[];
	country?: string;
	language?: string;
	freshness?: string;
}

const you_country_aliases: Record<string, string> = {
	uk: 'GB',
	gb: 'GB',
	usa: 'US',
	us: 'US',
};

const you_language_aliases: Record<string, string> = {
	english: 'EN',
	en: 'EN',
	'en-gb': 'EN-GB',
	japanese: 'JA',
	ja: 'JA',
	german: 'DE',
	de: 'DE',
	french: 'FR',
	fr: 'FR',
	spanish: 'ES',
	es: 'ES',
};

const normalize_you_date = (date: string) => {
	if (/^\d{4}$/.test(date)) return `${date}-01-01`;
	if (/^\d{4}-\d{2}$/.test(date)) return `${date}-01`;
	return date;
};

const normalize_you_country = (location: string) => {
	const normalized = location.toLowerCase().replace(/[\s_-]+/g, '');
	return you_country_aliases[normalized] ?? location.toUpperCase();
};

const normalize_you_language = (language: string) => {
	const normalized = language.toLowerCase();
	return you_language_aliases[normalized] ?? language.toUpperCase();
};

const map_you_freshness = (
	date_after?: string,
	date_before?: string,
) => {
	if (date_after && date_before) {
		return `${normalize_you_date(date_after)}to${normalize_you_date(date_before)}`;
	}

	if (!date_after) return undefined;

	const after = Date.parse(normalize_you_date(date_after));
	if (Number.isNaN(after)) return undefined;

	const days = (Date.now() - after) / 86_400_000;
	if (days <= 1) return 'day';
	if (days <= 7) return 'week';
	if (days <= 31) return 'month';
	return 'year';
};

const collect_you_results = (
	results:
		| v.InferOutput<typeof you_result_schema>[]
		| {
				web?: v.InferOutput<typeof you_result_schema>[];
				news?: v.InferOutput<typeof you_result_schema>[];
		  }
		| undefined,
) => {
	if (!results) return [];
	if (Array.isArray(results)) return results;
	return [...(results.web ?? []), ...(results.news ?? [])];
};

const snippet_from_you_result = (
	result: v.InferOutput<typeof you_result_schema>,
) => {
	if (result.description) return result.description;
	if (result.snippets?.length) return result.snippets.join(' ');
	return '';
};

export class YouSearchProvider implements SearchProvider {
	name = 'you';
	description =
		'Fast LLM-ready web and news search from You.com. Best for current-web and RAG-style snippets. Supports include_domains/exclude_domains, country, language, and freshness (day/week/month/year or YYYY-MM-DDtoYYYY-MM-DD). Query operators such as site:, lang:, loc:, before:, and after: are translated into those fields.';

	async search(params: BaseSearchParams): Promise<SearchResult[]> {
		const api_key = validate_api_key(
			config.search.you.api_key,
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
				const freshness = map_you_freshness(
					search_params.date_after,
					search_params.date_before,
				);

				const request_body: YouSearchRequest = {
					query: sanitize_query(
						build_query_with_operators({
							...search_params,
							include_domains: undefined,
							exclude_domains: undefined,
							language: undefined,
							location: undefined,
							date_after: freshness
								? undefined
								: search_params.date_after,
							date_before: freshness
								? undefined
								: search_params.date_before,
						}),
					),
					count: params.limit ?? 10,
				};

				if (include_domains.length > 0) {
					request_body.include_domains = include_domains;
				}
				if (exclude_domains.length > 0) {
					request_body.exclude_domains = exclude_domains;
				}
				if (search_params.location) {
					request_body.country = normalize_you_country(
						search_params.location,
					);
				}
				if (search_params.language) {
					request_body.language = normalize_you_language(
						search_params.language,
					);
				}
				if (freshness) {
					request_body.freshness = freshness;
				}

				const raw_data = await http_json(
					this.name,
					`${config.search.you.base_url}/v1/search`,
					{
						method: 'POST',
						headers: {
							Accept: 'application/json',
							'Content-Type': 'application/json',
							'X-API-Key': api_key,
						},
						body: JSON.stringify(request_body),
						signal: AbortSignal.timeout(config.search.you.timeout),
					},
				);
				const data = parse_provider_response(
					this.name,
					you_search_response_schema,
					raw_data,
				);

				return collect_you_results(data.results).map((result) => ({
					title: result.title ?? result.url,
					url: result.url,
					snippet: snippet_from_you_result(result),
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
