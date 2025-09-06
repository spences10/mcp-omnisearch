import { AbstractSearchProvider } from '../../../common/abstract-search-provider.js';
import {
	BaseSearchParams,
	SearchResult,
} from '../../../common/types.js';
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

export class TavilySearchProvider extends AbstractSearchProvider {
	readonly name = 'tavily';
	readonly description =
		'Search the web using Tavily Search API. Best for factual queries requiring reliable sources and citations. Supports domain filtering through API parameters (include_domains/exclude_domains). Provides high-quality results for technical, scientific, and academic topics. Use when you need verified information with strong citation support.';

	constructor() {
		super(
			{
				api_key: config.search.tavily.api_key || '',
				base_url: config.search.tavily.base_url,
				timeout: config.search.tavily.timeout,
				auth_type: 'bearer',
			},
			'tavily',
		);
	}

	async search(params: BaseSearchParams): Promise<SearchResult[]> {
		// Validate input parameters
		this.validate_search_params(params);

		const search_request = async () => {
			// Parse query operators and get domain filters
			const { base_query } = this.parse_query_operators(params.query);
			const domain_filters = this.build_domain_filters(
				params,
				{},
				'array',
			) as {
				include_domains: string[];
				exclude_domains: string[];
			};

			// Only use officially supported parameters
			const request_body: Record<string, any> = {
				query: base_query, // Use parsed and sanitized query
				max_results: params.limit ?? 5,
				include_domains: domain_filters.include_domains,
				exclude_domains: domain_filters.exclude_domains,
				search_depth: 'basic',
				topic: 'general',
			};

			const response =
				await this.http_client.post<TavilySearchResponse>(
					`${this.config.base_url}/search`,
					request_body,
					this.name,
				);

			return response.data.results.map((result) => ({
				title: result.title,
				url: result.url,
				snippet: result.content,
				score: result.score,
				source_provider: this.name,
			}));
		};

		return this.execute_with_retry(search_request);
	}
}
