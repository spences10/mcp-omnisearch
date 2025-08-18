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

interface GoogleSearchResponse {
	items?: Array<{
		title: string;
		link: string;
		snippet: string;
		displayLink: string;
		formattedUrl: string;
		htmlTitle: string;
		htmlSnippet: string;
		cacheId?: string;
		pagemap?: {
			metatags?: Array<{
				[key: string]: string;
			}>;
			cse_thumbnail?: Array<{
				src: string;
				width: string;
				height: string;
			}>;
		};
	}>;
	searchInformation?: {
		searchTime: number;
		formattedSearchTime: string;
		totalResults: string;
		formattedTotalResults: string;
	};
	queries?: {
		request: Array<{
			title: string;
			totalResults: string;
			searchTerms: string;
			count: number;
			startIndex: number;
			inputEncoding: string;
			outputEncoding: string;
			safe: string;
			cx: string;
		}>;
	};
	error?: {
		code: number;
		message: string;
		errors: Array<{
			domain: string;
			reason: string;
			message: string;
		}>;
	};
}

export class GoogleSearchProvider implements SearchProvider {
	name = 'google';
	description =
		'Google Custom Search API for comprehensive web search results. Provides access to Google\'s powerful search algorithm with high-quality, relevant results. Supports advanced search operators, site filtering, and custom search engines. Requires Google Cloud API key and Custom Search Engine ID. Best for applications requiring Google\'s search quality and comprehensive web coverage.';

	async search(params: BaseSearchParams): Promise<SearchResult[]> {
		const { query, limit = 10 } = params;

		// Validate API key
		const api_key = config.search.google.api_key;
		if (!validate_api_key(api_key, this.name)) {
			throw new ProviderError(
				ErrorType.API_ERROR,
				'Google Search API key is required',
				this.name,
			);
		}

		// Validate Custom Search Engine ID
		const cx = config.search.google.cx;
		if (!cx) {
			throw new ProviderError(
				ErrorType.API_ERROR,
				'Google Custom Search Engine ID (cx) is required',
				this.name,
			);
		}

		// Sanitize and validate query
		const sanitized_query = sanitize_query(query);
		if (!sanitized_query) {
			throw new ProviderError(
				ErrorType.INVALID_INPUT,
				'Query cannot be empty',
				this.name,
			);
		}

		// Parse and apply search operators
		const parsed_query = parse_search_operators(sanitized_query);
		const search_params = apply_search_operators(parsed_query);

		// Use the base query for Google search
		const final_query = search_params.query || parsed_query.base_query;

		return retry_with_backoff(async () => {
			try {
				// Build Google Custom Search API URL
				const search_url = new URL(`${config.search.google.base_url}/customsearch/v1`);
				
				// Required parameters
				search_url.searchParams.set('key', api_key);
				search_url.searchParams.set('cx', cx);
				search_url.searchParams.set('q', final_query);
				
				// Optional parameters
				if (limit && limit !== 10) {
					search_url.searchParams.set('num', Math.min(limit, 10).toString()); // Google API max 10 per request
				}
				
				// Set safe search
				search_url.searchParams.set('safe', 'medium');
				
				// Set language preference (correct format)
				search_url.searchParams.set('lr', 'lang:en');
				
				const response = await fetch(search_url.toString(), {
					method: 'GET',
					headers: {
						'Accept': 'application/json',
						'User-Agent': 'mcp-omnisearch/1.0',
					},
					signal: AbortSignal.timeout(config.search.google.timeout),
				});

				const data = await response.json() as GoogleSearchResponse;

				if (!response.ok) {
					const error_message = data.error?.message || 'Unknown error';

					switch (response.status) {
						case 400:
							throw new ProviderError(
								ErrorType.INVALID_INPUT,
								`Bad request: ${error_message}`,
								this.name,
							);
						case 401:
							throw new ProviderError(
								ErrorType.API_ERROR,
								'Invalid API key or unauthorized access',
								this.name,
							);
						case 403:
							throw new ProviderError(
								ErrorType.API_ERROR,
								'API quota exceeded or access forbidden',
								this.name,
							);
						case 429:
							handle_rate_limit(this.name);
							return [];
						case 500:
							throw new ProviderError(
								ErrorType.PROVIDER_ERROR,
								'Google Search API internal error',
								this.name,
							);
						default:
							throw new ProviderError(
								ErrorType.API_ERROR,
								`Google Search API error: ${response.status} - ${error_message}`,
								this.name,
							);
					}
				}

				// Check for API-level errors
				if (data.error) {
					throw new ProviderError(
						ErrorType.API_ERROR,
						`Google Search API error: ${data.error.message}`,
						this.name,
					);
				}

				// Handle no results
				if (!data.items || data.items.length === 0) {
					return [];
				}

				// Transform results to our format
				const results: SearchResult[] = data.items.map(item => ({
					title: this.cleanHtmlEntities(item.title),
					url: item.link,
					snippet: this.cleanHtmlEntities(item.snippet),
					source_provider: this.name,
				}));

				return results;

			} catch (error) {
				if (error instanceof ProviderError) {
					throw error;
				}
				throw new ProviderError(
					ErrorType.API_ERROR,
					`Network error: ${error instanceof Error ? error.message : 'Unknown error'}`,
					this.name,
				);
			}
		});
	}

	private cleanHtmlEntities(text: string): string {
		return text
			.replace(/&lt;/g, '<')
			.replace(/&gt;/g, '>')
			.replace(/&amp;/g, '&')
			.replace(/&quot;/g, '"')
			.replace(/&#39;/g, "'")
			.replace(/&nbsp;/g, ' ')
			.replace(/<\/?[^>]+(>|$)/g, '') // Remove any remaining HTML tags
			.trim();
	}
}