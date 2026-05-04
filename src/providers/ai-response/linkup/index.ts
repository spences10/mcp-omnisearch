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

interface LinkupSearchRequest {
	q: string;
	depth: 'fast' | 'standard' | 'deep';
	outputType: 'sourcedAnswer';
	includeDomains?: string[];
	excludeDomains?: string[];
	maxResults?: number;
}

interface LinkupSourcedAnswerResponse {
	answer: string;
	sources: Array<{
		favicon: string;
		name: string;
		snippet: string;
		url: string;
	}>;
}

export class LinkupProvider implements SearchProvider {
	name = 'linkup';
	description =
		'AI-powered deep search with sourced answers via Linkup. Uses agentic search with standard depth for balanced speed and accuracy.';

	async search(params: BaseSearchParams): Promise<SearchResult[]> {
		const api_key = validate_api_key(
			config.ai_response.linkup.api_key,
			this.name,
		);

		const search_request = async () => {
			try {
				const request_body: LinkupSearchRequest = {
					q: sanitize_query(params.query),
					depth: 'standard',
					outputType: 'sourcedAnswer',
				};

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
				if (params.limit) {
					request_body.maxResults = params.limit;
				}

				const data = await http_json<LinkupSourcedAnswerResponse>(
					this.name,
					`${config.ai_response.linkup.base_url}/search`,
					{
						method: 'POST',
						headers: {
							Authorization: `Bearer ${api_key}`,
							'Content-Type': 'application/json',
						},
						body: JSON.stringify(request_body),
						signal: AbortSignal.timeout(
							config.ai_response.linkup.timeout,
						),
					},
				);

				const results: SearchResult[] = [
					{
						title: 'Linkup AI Answer',
						url: '',
						snippet: data.answer,
						score: 1.0,
						source_provider: this.name,
						metadata: {
							type: 'ai_answer',
							depth: 'standard',
							sources_count: data.sources?.length || 0,
						},
					},
				];

				if (data.sources && data.sources.length > 0) {
					const source_results = data.sources.map(
						(source, index) => ({
							title: source.name,
							url: source.url,
							snippet: source.snippet || 'Source reference',
							score: 0.9 - index * 0.01,
							source_provider: this.name,
							metadata: {
								type: 'source',
								favicon: source.favicon,
							},
						}),
					);
					results.push(...source_results);
				}

				return results;
			} catch (error) {
				handle_provider_error(error, this.name, 'fetch AI response');
			}
		};

		return retry_with_backoff(search_request);
	}
}
