import { AbstractSearchProvider } from '../../../common/abstract-search-provider.js';
import {
	BaseSearchParams,
	SearchResult,
} from '../../../common/types.js';
import { config } from '../../../config/env.js';

interface ExaSearchRequest {
	query: string;
	type?: string;
	numResults?: number;
	includeDomains?: string[];
	excludeDomains?: string[];
	contents?: {
		text?: { maxCharacters?: number };
		livecrawl?: 'always' | 'fallback' | 'preferred';
	};
	category?: string;
	useAutoprompt?: boolean;
}

interface ExaSearchResult {
	id: string;
	title: string;
	url: string;
	publishedDate?: string;
	author?: string;
	text?: string;
	score?: number;
	highlights?: string[];
	summary?: string;
}

interface ExaSearchResponse {
	requestId: string;
	autopromptString?: string;
	resolvedSearchType: string;
	results: ExaSearchResult[];
}

export class ExaSearchProvider extends AbstractSearchProvider {
	readonly name = 'exa';
	readonly description =
		'AI-powered web search using neural and keyword search. Optimized for AI applications with semantic understanding, content extraction, and research capabilities.';

	constructor() {
		super(
			{
				api_key: config.search.exa.api_key || '',
				base_url: config.search.exa.base_url,
				timeout: config.search.exa.timeout,
				auth_type: 'api-key',
				custom_headers: {
					'x-api-key': config.search.exa.api_key || '',
				},
			},
			'exa',
		);
	}

	async search(params: BaseSearchParams): Promise<SearchResult[]> {
		// Validate input parameters
		this.validate_search_params(params);

		const search_request = async () => {
			// Parse query operators
			const { base_query } = this.parse_query_operators(params.query);

			// Build domain filters
			const domain_filters = this.build_domain_filters(
				params,
				{},
				'array',
			) as {
				include_domains: string[];
				exclude_domains: string[];
			};

			const request_body: ExaSearchRequest = {
				query: base_query,
				type: 'auto', // Let Exa choose between neural and keyword search
				numResults: params.limit ?? 10,
				useAutoprompt: true,
				contents: {
					text: { maxCharacters: 3000 },
					livecrawl: 'fallback',
				},
			};

			// Add domain filtering if provided
			if (domain_filters.include_domains.length > 0) {
				request_body.includeDomains = domain_filters.include_domains;
			}
			if (domain_filters.exclude_domains.length > 0) {
				request_body.excludeDomains = domain_filters.exclude_domains;
			}

			const response = await this.http_client.post<ExaSearchResponse>(
				`${this.config.base_url}/search`,
				request_body,
				this.name,
			);

			return response.data.results.map((result) => ({
				title: result.title,
				url: result.url,
				snippet:
					result.text || result.summary || 'No content available',
				score: result.score || 0,
				source_provider: this.name,
				metadata: {
					id: result.id,
					author: result.author,
					publishedDate: result.publishedDate,
					highlights: result.highlights,
					autopromptString: response.data.autopromptString,
					resolvedSearchType: response.data.resolvedSearchType,
				},
			}));
		};

		return this.execute_with_retry(search_request);
	}
}
