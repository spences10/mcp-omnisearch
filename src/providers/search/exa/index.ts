import {
	handle_provider_error,
	sanitize_query,
} from '../../../common/errors.js';
import { http_json } from '../../../common/http.js';
import { retry_with_backoff } from '../../../common/retry.js';
import {
	BaseSearchParams,
	SearchProvider,
	SearchResult,
} from '../../../common/types.js';
import { validate_api_key } from '../../../common/validation.js';
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

export class ExaSearchProvider implements SearchProvider {
	name = 'exa';
	description =
		'AI-powered web search using neural and keyword search. Optimized for AI applications with semantic understanding, content extraction, and research capabilities.';

	async search(params: BaseSearchParams): Promise<SearchResult[]> {
		const api_key = validate_api_key(
			config.search.exa.api_key,
			this.name,
		);

		const search_request = async () => {
			try {
				const request_body: ExaSearchRequest = {
					query: sanitize_query(params.query),
					type: 'auto', // Let Exa choose between neural and keyword search
					numResults: params.limit ?? 10,
					useAutoprompt: true,
					contents: {
						text: { maxCharacters: 3000 },
						livecrawl: 'fallback',
					},
				};

				// Add domain filtering if provided
				if (
					params.include_domains &&
					params.include_domains.length > 0
				) {
					request_body.includeDomains = params.include_domains;
				}
				if (
					params.exclude_domains &&
					params.exclude_domains.length > 0
				) {
					request_body.excludeDomains = params.exclude_domains;
				}

				const data = await http_json<ExaSearchResponse>(
					this.name,
					`${config.search.exa.base_url}/search`,
					{
						method: 'POST',
						headers: {
							// Exa accepts either x-api-key or Authorization Bearer
							'x-api-key': api_key,
							Authorization: `Bearer ${api_key}`,
							'Content-Type': 'application/json',
						},
						body: JSON.stringify(request_body),
					},
				);

				return data.results.map((result) => ({
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
						autopromptString: data.autopromptString,
						resolvedSearchType: data.resolvedSearchType,
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
