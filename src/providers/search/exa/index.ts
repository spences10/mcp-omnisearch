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

interface ExaRequestBody {
	query: string;
	numResults: number;
	text: boolean;
	includeDomains?: string[];
	excludeDomains?: string[];
}

interface ExaSearchResponse {
	requestId: string;
	resolvedSearchType: string;
	results: Array<{
		title: string;
		url: string;
		publishedDate?: string;
		author?: string;
		text?: string;
		summary?: string;
		highlights?: string[];
		score?: number;
	}>;
	costDollars: number;
}

export class ExaSearchProvider implements SearchProvider {
	name = 'exa';
	description =
		'AI-powered semantic web search using neural embeddings. Unlike keyword-based search, Exa understands meaning and context to find the most relevant content. Best for research, factual queries, and discovering content that matches semantic intent rather than exact keywords.';

	async search(params: BaseSearchParams): Promise<SearchResult[]> {
		const api_key = validate_api_key(
			config.search.exa.api_key,
			this.name,
		);

		const search_request = async () => {
			try {
				// Parse search operators from the query
				const parsed_query = parse_search_operators(params.query);
				const search_params = apply_search_operators(parsed_query);
				const query = sanitize_query(search_params.query);

				// Combine domain filters from params and search operators
				const include_domains = [
					...(params.include_domains ?? []),
					...(search_params.include_domains ?? []),
				];
				const exclude_domains = [
					...(params.exclude_domains ?? []),
					...(search_params.exclude_domains ?? []),
				];

				// Build the request body
				const request_body: ExaRequestBody = {
					query: query,
					numResults: params.limit ?? 10,
					text: true, // Get text content for better results
				};

				// Add domain filters if specified
				if (include_domains.length > 0) {
					request_body.includeDomains = include_domains;
				}
				if (exclude_domains.length > 0) {
					request_body.excludeDomains = exclude_domains;
				}

				const response = await fetch(`${config.search.exa.base_url}/search`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'x-api-key': api_key,
					},
					body: JSON.stringify(request_body),
					signal: AbortSignal.timeout(config.search.exa.timeout),
				});

				let data: ExaSearchResponse & { error?: string; message?: string };
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
					const error_message = data.error || data.message || response.statusText;
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
								'Exa Search API internal error',
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

				if (!data.results) {
					throw new ProviderError(
						ErrorType.API_ERROR,
						'No results field in response',
						this.name,
					);
				}

				return data.results.map((result) => ({
					title: result.title,
					url: result.url,
					snippet: result.text || result.summary || result.title,
					score: result.score,
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