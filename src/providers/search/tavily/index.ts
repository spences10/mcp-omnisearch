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
	parse_search_operators,
} from '../../../common/search-operators.js';
import {
	BaseSearchParams,
	SearchProvider,
	SearchResult,
} from '../../../common/types.js';
import { validate_api_key } from '../../../common/validation.js';
import { config } from '../../../config/env.js';

interface TavilySearchRequest {
	query: string;
	max_results: number;
	include_domains: string[];
	exclude_domains: string[];
	search_depth: 'basic' | 'advanced' | 'fast' | 'ultra-fast';
	topic: 'general' | 'news' | 'finance';
	time_range?: 'day' | 'week' | 'month' | 'year';
	safe_search?: boolean;
	include_raw_content?: boolean;
	auto_parameters?: boolean;
	include_favicon: boolean;
	include_usage: boolean;
	start_date?: string;
	end_date?: string;
	exact_match?: boolean;
	country?: string;
}

const tavily_search_response_schema = v.object({
	results: v.array(
		v.object({
			title: v.string(),
			url: v.string(),
			content: v.string(),
			raw_content: v.optional(v.nullable(v.string())),
			favicon: v.optional(v.string()),
			score: v.number(),
		}),
	),
	response_time: v.optional(v.union([v.number(), v.string()])),
	request_id: v.optional(v.string()),
	auto_parameters: v.optional(v.record(v.string(), v.unknown())),
	usage: v.optional(
		v.object({
			credits: v.number(),
		}),
	),
});

const normalize_tavily_date = (date: string) => {
	if (/^\d{4}$/.test(date)) return `${date}-01-01`;
	if (/^\d{4}-\d{2}$/.test(date)) return `${date}-01`;
	return date;
};

const tavily_country_aliases: Record<string, string> = {
	uk: 'united kingdom',
	us: 'united states',
	usa: 'united states',
};

const normalize_tavily_country = (location: string) => {
	const normalized = location.toLowerCase().replace(/-/g, ' ');
	return tavily_country_aliases[normalized] ?? normalized;
};

export class TavilySearchProvider implements SearchProvider {
	name = 'tavily';
	description =
		'Search the web using Tavily Search API. Best for factual queries requiring reliable sources and citations. Supports domain filtering through API parameters (include_domains/exclude_domains). Provides high-quality results for technical, scientific, and academic topics. Use when you need verified information with strong citation support.';

	async search(params: BaseSearchParams): Promise<SearchResult[]> {
		const api_key = validate_api_key(
			config.search.tavily.api_key,
			this.name,
		);

		const parsed_query = parse_search_operators(params.query);
		const search_params = apply_search_operators(parsed_query);

		const search_request = async () => {
			try {
				// Merge operator-extracted domains with explicit params
				const include_domains = [
					...(params.include_domains ?? []),
					...(search_params.include_domains ?? []),
				];
				const exclude_domains = [
					...(params.exclude_domains ?? []),
					...(search_params.exclude_domains ?? []),
				];

				const request_body: TavilySearchRequest = {
					query: sanitize_query(search_params.query),
					max_results: params.limit ?? 5,
					include_domains:
						include_domains.length > 0 ? include_domains : [],
					exclude_domains:
						exclude_domains.length > 0 ? exclude_domains : [],
					search_depth: params.search_depth ?? 'basic',
					topic: params.topic ?? 'general',
					include_favicon: true,
					include_usage: true,
				};

				if (params.time_range) {
					request_body.time_range = params.time_range;
				}
				if (params.safe_search !== undefined) {
					request_body.safe_search = params.safe_search;
				}
				if (params.include_raw_content !== undefined) {
					request_body.include_raw_content =
						params.include_raw_content;
				}
				if (params.auto_parameters !== undefined) {
					request_body.auto_parameters = params.auto_parameters;
				}

				// Map date operators to Tavily's start_date/end_date
				if (search_params.date_after) {
					request_body.start_date = normalize_tavily_date(
						search_params.date_after,
					);
				}
				if (search_params.date_before) {
					request_body.end_date = normalize_tavily_date(
						search_params.date_before,
					);
				}

				// Map exact phrases to Tavily's exact_match
				if (
					search_params.exact_phrases &&
					search_params.exact_phrases.length > 0
				) {
					request_body.exact_match = true;
					// Re-add quoted phrases to the query for Tavily
					const exact_query_parts = search_params.exact_phrases.map(
						(phrase) => `"${phrase}"`,
					);
					request_body.query =
						`${request_body.query} ${exact_query_parts.join(' ')}`.trim();
				}

				// Map location operator to Tavily's country param
				if (search_params.location) {
					request_body.country = normalize_tavily_country(
						search_params.location,
					);
				}

				const raw_data = await http_json(
					this.name,
					`${config.search.tavily.base_url}/search`,
					{
						method: 'POST',
						headers: {
							Authorization: `Bearer ${api_key}`,
							'Content-Type': 'application/json',
						},
						body: JSON.stringify(request_body),
					},
				);
				const data = parse_provider_response(
					this.name,
					tavily_search_response_schema,
					raw_data,
				);

				return data.results.map((result) => ({
					title: result.title,
					url: result.url,
					snippet: result.content,
					score: result.score,
					source_provider: this.name,
					metadata: {
						...(params.include_raw_content && result.raw_content
							? { raw_content: result.raw_content }
							: {}),
						...(result.favicon ? { favicon: result.favicon } : {}),
						...(data.request_id
							? { request_id: data.request_id }
							: {}),
						...(data.response_time !== undefined
							? { response_time: data.response_time }
							: {}),
						...(data.auto_parameters
							? { auto_parameters: data.auto_parameters }
							: {}),
						...(data.usage ? { usage: data.usage } : {}),
					},
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
