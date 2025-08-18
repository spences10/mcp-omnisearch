import {
	BaseSearchParams,
	ErrorType,
	ProviderError,
	SearchProvider,
	SearchResult,
} from '../../../common/types.js';
import {
	apply_search_operators,
	handle_rate_limit,
	parse_search_operators,
	retry_with_backoff,
	sanitize_query,
	validate_api_key,
} from '../../../common/utils.js';
import { config } from '../../../config/env.js';

interface BaiduSearchResult {
	title: string;
	link: string;
	snippet: string;
	position?: number;
}

interface BaiduSearchResponse {
	organic_results?: BaiduSearchResult[];
	search_metadata?: {
		status: string;
		total_results?: number;
		query?: string;
	};
	error?: string;
}

export class BaiduSearchProvider implements SearchProvider {
	name = 'baidu';
	description =
		'Baidu search engine results from China\'s leading search provider. Comprehensive coverage of Chinese web content with support for simplified and traditional Chinese. Best for Chinese market research, local content discovery, and accessing China-specific information that may not be available on other search engines.';

	async search(params: BaseSearchParams): Promise<SearchResult[]> {
		const api_key = validate_api_key(
			config.search.baidu.api_key,
			this.name,
		);

		const search_request = async () => {
			try {
				// Parse search operators from the query
				const parsed_query = parse_search_operators(params.query);
				const search_params = apply_search_operators(parsed_query);
				const query = sanitize_query(search_params.query);

				// Handle domain filters using search operators
				const include_domains = [
					...(params.include_domains ?? []),
					...(search_params.include_domains ?? []),
				];
				const exclude_domains = [
					...(params.exclude_domains ?? []),
					...(search_params.exclude_domains ?? []),
				];

				// Add domain filters to the search query
				let final_query = query;
				if (include_domains.length > 0) {
					const domain_filters = include_domains.map(domain => `site:${domain}`).join(' OR ');
					final_query += ` (${domain_filters})`;
				}
				if (exclude_domains.length > 0) {
					const exclude_filters = exclude_domains.map(domain => `-site:${domain}`).join(' ');
					final_query += ` ${exclude_filters}`;
				}

				// Build query parameters
				// Note: SerpApi requires API key in query params (their standard authentication method)
				// Security: API key is passed via HTTPS and should be stored in environment variables
				const query_params = new URLSearchParams({
					engine: 'baidu',
					q: final_query,
					api_key: api_key,
				});

				// Add results limit if specified
				if (params.limit && params.limit !== 10) {
					query_params.set('rn', Math.min(params.limit, 50).toString()); // Baidu API limited to 50
				}

				// Set language preference (default to simplified Chinese for better Baidu results)
				query_params.set('ct', '2'); // 1 = All languages, 2 = Simplified Chinese, 3 = Traditional Chinese

				const response = await fetch(
					`${config.search.baidu.base_url}/search?${query_params}`,
					{
						method: 'GET',
						headers: {
							Accept: 'application/json',
						},
						signal: AbortSignal.timeout(config.search.baidu.timeout),
					},
				);

				let data: BaiduSearchResponse;
				try {
					const text = await response.text();
					data = JSON.parse(text);
				} catch (error) {
					throw new ProviderError(
						ErrorType.API_ERROR,
						`Invalid JSON response: ${
							error instanceof Error ? error.message : 'Unknown error'
						}`,
						this.name,
					);
				}

				if (!response.ok) {
					const error_message = data.error || response.statusText;
					switch (response.status) {
						case 401:
							throw new ProviderError(
								ErrorType.API_ERROR,
								'Invalid API key',
								this.name,
							);
						case 429:
							handle_rate_limit(this.name);
							return;
						case 400:
							throw new ProviderError(
								ErrorType.INVALID_INPUT,
								`Bad request: ${error_message}`,
								this.name,
							);
						case 500:
							throw new ProviderError(
								ErrorType.PROVIDER_ERROR,
								'Baidu Search API internal error',
								this.name,
							);
						default:
							throw new ProviderError(
								ErrorType.API_ERROR,
								`Unexpected error: ${error_message}`,
								this.name,
							);
					}
				}

				// Check for API-level errors
				if (data.search_metadata?.status === 'Error' || data.error) {
					throw new ProviderError(
						ErrorType.API_ERROR,
						data.error || 'Search request failed',
						this.name,
					);
				}

				if (!data.organic_results || !Array.isArray(data.organic_results)) {
					throw new ProviderError(
						ErrorType.API_ERROR,
						'No organic results found in response',
						this.name,
					);
				}

				return data.organic_results.map((result) => ({
					title: result.title,
					url: result.link,
					snippet: result.snippet,
					score: result.position ? 1 / result.position : undefined,
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