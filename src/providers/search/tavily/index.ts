import {
	handle_provider_error,
	sanitize_query,
} from '../../../common/errors.js';
import { http_json } from '../../../common/http.js';
import { retry_with_backoff } from '../../../common/retry.js';
import {
	apply_search_operators,
	parse_search_operators,
} from '../../../common/search_operators.js';
import {
	BaseSearchParams,
	SearchProvider,
	SearchResult,
} from '../../../common/types.js';
import { validate_api_key } from '../../../common/validation.js';
import { config } from '../../../config/env.js';

interface TavilySearchResponse {
	results: {
		title: string;
		url: string;
		content: string;
		score: number;
	}[];
	response_time: string;
}

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

				const request_body: Record<string, any> = {
					query: sanitize_query(search_params.query),
					max_results: params.limit ?? 5,
					include_domains:
						include_domains.length > 0 ? include_domains : [],
					exclude_domains:
						exclude_domains.length > 0 ? exclude_domains : [],
					search_depth: 'basic',
					topic: 'general',
				};

				// Map date operators to Tavily's start_date/end_date
				if (search_params.date_after) {
					request_body.start_date = search_params.date_after;
				}
				if (search_params.date_before) {
					request_body.end_date = search_params.date_before;
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
					request_body.country = search_params.location.toLowerCase();
				}

				const data = await http_json<
					TavilySearchResponse & { message?: string }
				>(this.name, `${config.search.tavily.base_url}/search`, {
					method: 'POST',
					headers: {
						Authorization: `Bearer ${api_key}`,
						'Content-Type': 'application/json',
					},
					body: JSON.stringify(request_body),
				});

				return (data.results || []).map((result) => ({
					title: result.title,
					url: result.url,
					snippet: result.content,
					score: result.score,
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
