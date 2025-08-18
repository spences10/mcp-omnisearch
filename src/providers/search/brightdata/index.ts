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

interface BrightDataRequestBody {
	zone: string;
	url: string;
	format: string;
}

interface BrightDataOrganic {
	title: string;
	url: string;
	snippet: string;
	position?: number;
}

interface BrightDataResponse {
	organic?: BrightDataOrganic[];
	search_metadata?: {
		total_results?: number;
		query?: string;
		country?: string;
		language?: string;
	};
}

export class BrightDataSearchProvider implements SearchProvider {
	name = 'brightdata';
	description =
		'SERP API for comprehensive search engine data collection with proxy management and unblocking. Supports Google, Bing, DuckDuckGo, Yandex, Baidu, Yahoo, and Naver. Best for large-scale data collection, market research, brand monitoring, and applications requiring robust anti-blocking capabilities.';

	async search(params: BaseSearchParams): Promise<SearchResult[]> {
		const api_key = validate_api_key(
			config.search.brightdata.api_key,
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

				// Build Google search URL with Bright Data JSON parsing
				const search_params_obj = new URLSearchParams({
					q: final_query,
					brd_json: '1', // Request parsed JSON response
				});

				// Add results limit if specified
				if (params.limit && params.limit !== 10) {
					search_params_obj.set('num', params.limit.toString());
				}

				const search_url = `https://www.google.com/search?${search_params_obj.toString()}`;

				// Build the request body
				const request_body: BrightDataRequestBody = {
					zone: config.search.brightdata.zone_name,
					url: search_url,
					format: 'json', // Get parsed JSON response
				};

				const response = await fetch(`${config.search.brightdata.base_url}/request`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'Authorization': `Bearer ${api_key}`,
					},
					body: JSON.stringify(request_body),
					signal: AbortSignal.timeout(config.search.brightdata.timeout),
				});

				if (!response.ok) {
					const error_text = await response.text();
					let error_message = error_text || response.statusText;
					
					try {
						const error_data = JSON.parse(error_text);
						error_message = error_data.message || error_data.error || error_message;
					} catch {
						// Keep the original error text if JSON parsing fails
					}

					switch (response.status) {
						case 401:
							throw new ProviderError(
								ErrorType.API_ERROR,
								'Invalid API key',
								this.name,
							);
						case 429:
							handle_rate_limit(this.name);
						case 400:
							throw new ProviderError(
								ErrorType.INVALID_INPUT,
								`Bad request: ${error_message}`,
								this.name,
							);
						case 500:
							throw new ProviderError(
								ErrorType.PROVIDER_ERROR,
								'Bright Data API internal error',
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

				let data: BrightDataResponse;
				try {
					const response_text = await response.text();
					data = JSON.parse(response_text);
				} catch (error) {
					throw new ProviderError(
						ErrorType.API_ERROR,
						`Invalid JSON response: ${
							error instanceof Error ? error.message : 'Unknown error'
						}`,
						this.name,
					);
				}

				if (!data.organic || !Array.isArray(data.organic)) {
					throw new ProviderError(
						ErrorType.API_ERROR,
						'No organic results found in response',
						this.name,
					);
				}

				return data.organic.map((result) => ({
					title: result.title,
					url: result.url,
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