import { AbstractSearchProvider } from '../../../common/abstract-search-provider.js';
import {
	BaseSearchParams,
	SearchResult,
} from '../../../common/types.js';
import { config } from '../../../config/env.js';

interface KagiSearchResponse {
	data: Array<{
		title: string;
		url: string;
		snippet: string;
		rank?: number;
	}>;
	meta?: {
		total_hits: number;
		api_balance?: number;
	};
}

export class KagiSearchProvider extends AbstractSearchProvider {
	readonly name = 'kagi';
	readonly description =
		'High-quality search results with minimal advertising influence, focused on authoritative sources. Supports search operators in query string (site:, -site:, filetype:, intitle:, inurl:, before:, after:, and exact phrases). Features strong privacy protection and access to specialized knowledge indexes. Best for research, technical documentation, and finding high-quality content without SEO manipulation.';

	constructor() {
		super(
			{
				api_key: config.search.kagi.api_key || '',
				base_url: config.search.kagi.base_url,
				timeout: config.search.kagi.timeout,
				auth_type: 'bearer',
			},
			'kagi',
		);
	}

	async search(params: BaseSearchParams): Promise<SearchResult[]> {
		// Validate input parameters
		this.validate_search_params(params);

		const search_request = async () => {
			// Parse query operators
			const { base_query, search_params } =
				this.parse_query_operators(params.query);

			let query = base_query;

			// Build operator filters
			const filters: string[] = [];

			// Handle domain filters using built-in method
			const domain_filters = this.build_domain_filters(
				params,
				search_params,
				'query',
			) as {
				include_filter: string;
				exclude_filter: string;
			};

			if (domain_filters.include_filter) {
				filters.push(domain_filters.include_filter);
			}
			if (domain_filters.exclude_filter) {
				filters.push(domain_filters.exclude_filter);
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

			// Combine query with filters
			if (filters.length) {
				query = `${query} ${filters.join(' ')}`;
			}

			const url = new URL(`${this.config.base_url}/v0/search`);
			url.searchParams.set('q', query);
			url.searchParams.set('limit', String(params.limit ?? 10));

			const response = await this.http_client.get<KagiSearchResponse>(
				url.toString(),
				this.name,
			);

			if (!response.data.data) {
				return [];
			}

			return response.data.data.map((result, index) => ({
				title: result.title,
				url: result.url,
				snippet: result.snippet,
				score: result.rank ?? 1.0 - index * 0.1,
				source_provider: this.name,
			}));
		};

		return this.execute_with_retry(search_request);
	}
}
