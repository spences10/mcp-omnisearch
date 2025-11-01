import { http_json } from '../../../common/http.js';
import {
	BaseSearchParams,
	ErrorType,
	ProviderError,
	SearchProvider,
	SearchResult,
} from '../../../common/types.js';
import {
	apply_search_operators,
	parse_search_operators,
	retry_with_backoff,
	sanitize_query,
	validate_api_key,
} from '../../../common/utils.js';
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

		const search_request = async () => {
			try {
				// Check if query already contains operators - if so, use it directly
				const has_operators =
					/(?:site:|filetype:|ext:|intitle:|inurl:|inbody:|inpage:|lang:|loc:|before:|after:)/.test(
						params.query,
					);

				let query: string;

				if (
					has_operators &&
					!params.include_domains?.length &&
					!params.exclude_domains?.length
				) {
					// Use original query as-is to preserve operator semantics
					query = sanitize_query(params.query);
				} else {
					// Parse and reconstruct only when needed (e.g., API parameters provided)
					const parsed_query = parse_search_operators(params.query);
					const search_params = apply_search_operators(parsed_query);

					query = sanitize_query(search_params.query);

					// Build operator filters
					const filters: string[] = [];

					// Handle domain filters from both parsed query and API parameters
					const include_domains = [
						...(params.include_domains ?? []),
						...(search_params.include_domains ?? []),
					];
					if (include_domains.length) {
						// Use simple space-separated format instead of OR with parentheses
						filters.push(
							...include_domains.map((domain) => `site:${domain}`),
						);
					}

					const exclude_domains = [
						...(params.exclude_domains ?? []),
						...(search_params.exclude_domains ?? []),
					];
					if (exclude_domains.length) {
						filters.push(
							...exclude_domains.map((domain) => `-site:${domain}`),
						);
					}

					// Add file type filter
					if (search_params.file_type) {
						filters.push(`filetype:${search_params.file_type}`);
					}

					// Add title filter
					if (search_params.title_filter) {
						filters.push(`intitle:${search_params.title_filter}`);
					}

					// Add URL filter
					if (search_params.url_filter) {
						filters.push(`inurl:${search_params.url_filter}`);
					}

					// Add body filter
					if (search_params.body_filter) {
						filters.push(`inbody:${search_params.body_filter}`);
					}

					// Add page filter
					if (search_params.page_filter) {
						filters.push(`inpage:${search_params.page_filter}`);
					}

					// Add language filter
					if (search_params.language) {
						filters.push(`lang:${search_params.language}`);
					}

					// Add location filter
					if (search_params.location) {
						filters.push(`loc:${search_params.location}`);
					}

					// Add date filters
					if (search_params.date_before) {
						filters.push(`before:${search_params.date_before}`);
					}
					if (search_params.date_after) {
						filters.push(`after:${search_params.date_after}`);
					}

					// Add exact phrases
					if (search_params.exact_phrases?.length) {
						filters.push(
							...search_params.exact_phrases.map(
								(phrase) => `"${phrase}"`,
							),
						);
					}

					// Add force include terms
					if (search_params.force_include_terms?.length) {
						filters.push(
							...search_params.force_include_terms.map(
								(term) => `+${term}`,
							),
						);
					}

					// Add exclude terms
					if (search_params.exclude_terms?.length) {
						filters.push(
							...search_params.exclude_terms.map(
								(term) => `-${term}`,
							),
						);
					}

					// Combine query with filters
					if (filters.length > 0) {
						query = `${query} ${filters.join(' ')}`;
					}
				}

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
				if (error instanceof ProviderError) {
					throw error;
				}
				throw new ProviderError(
					ErrorType.API_ERROR,
					`Failed to fetch: ${
						error instanceof Error ? error.message : 'Unknown error'
					}`,
					this.name,
				);
			}
		};

		return retry_with_backoff(search_request);
	}
}
