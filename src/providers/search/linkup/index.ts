import { http_json } from '../../../common/http.js';
import {
	BaseSearchParams,
	SearchProvider,
	SearchResult,
} from '../../../common/types.js';
import {
	handle_provider_error,
	retry_with_backoff,
	sanitize_query,
	validate_api_key,
} from '../../../common/utils.js';
import { config } from '../../../config/env.js';

interface LinkupSearchResult {
	type: 'text' | 'image';
	name: string;
	url: string;
	content: string;
	favicon: string;
}

interface LinkupSearchResponse {
	results: LinkupSearchResult[];
}

export class LinkupSearchProvider implements SearchProvider {
	name = 'linkup';
	description =
		'Agentic web search via Linkup. #1 factuality on SimpleQA benchmark. Returns structured search results with source content. Supports domain and date filtering.';

	async search(
		params: BaseSearchParams & { depth?: 'fast' | 'standard' | 'deep' },
	): Promise<SearchResult[]> {
		const api_key = validate_api_key(
			config.search.linkup.api_key,
			this.name,
		);

		const search_request = async () => {
			try {
				const request_body: Record<string, any> = {
					q: sanitize_query(params.query),
					depth: params.depth ?? 'standard',
					outputType: 'searchResults',
				};

				if (params.limit) {
					request_body.maxResults = params.limit;
				}

				if (
					params.include_domains &&
					params.include_domains.length > 0
				) {
					request_body.includeDomains =
						params.include_domains.slice(0, 50);
					if (params.include_domains.length > 50) {
						console.warn(
							'Linkup: includeDomains truncated to 50 entries',
						);
					}
				}

				if (
					params.exclude_domains &&
					params.exclude_domains.length > 0
				) {
					request_body.excludeDomains =
						params.exclude_domains.slice(0, 50);
					if (params.exclude_domains.length > 50) {
						console.warn(
							'Linkup: excludeDomains truncated to 50 entries',
						);
					}
				}

				const data = await http_json<LinkupSearchResponse>(
					this.name,
					`${config.search.linkup.base_url}/search`,
					{
						method: 'POST',
						headers: {
							Authorization: `Bearer ${api_key}`,
							'Content-Type': 'application/json',
						},
						body: JSON.stringify(request_body),
						signal: AbortSignal.timeout(
							config.search.linkup.timeout,
						),
					},
				);

				return (data.results || [])
					.filter((result) => result.type === 'text')
					.map((result) => ({
						title: result.name,
						url: result.url,
						snippet: result.content,
						source_provider: this.name,
						metadata: {
							favicon: result.favicon,
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
