import { http_json } from '../../../common/http.js';
import {
	BaseSearchParams,
	SearchProvider,
	SearchResult,
} from '../../../common/types.js';
import {
	apply_search_operators,
	handle_provider_error,
	parse_search_operators,
	retry_with_backoff,
	sanitize_query,
	validate_api_key,
} from '../../../common/utils.js';
import { config } from '../../../config/env.js';

interface LinkupSource {
	name: string;
	url: string;
	snippet: string;
	favicon: string;
}

interface LinkupSourcedAnswerResponse {
	answer: string;
	sources: LinkupSource[];
}

export class LinkupAnswerProvider implements SearchProvider {
	name = 'linkup_answer';
	description =
		'AI-powered sourced answers from Linkup deep search. Uses multi-step agentic retrieval for comprehensive, cited responses. Best for complex queries requiring synthesis across multiple sources.';

	async search(
		params: BaseSearchParams & { depth?: 'fast' | 'standard' | 'deep' },
	): Promise<SearchResult[]> {
		const api_key = validate_api_key(
			config.ai_response.linkup_answer.api_key,
			this.name,
		);

		const parsed_query = parse_search_operators(params.query);
		const search_params = apply_search_operators(parsed_query);

		const search_request = async () => {
			try {
				const request_body: Record<string, any> = {
					q: sanitize_query(params.query),
					depth: params.depth ?? 'deep',
					outputType: 'sourcedAnswer',
				};

				if (
					params.include_domains &&
					params.include_domains.length > 0
				) {
					request_body.includeDomains =
						params.include_domains.slice(0, 50);
				}

				if (
					params.exclude_domains &&
					params.exclude_domains.length > 0
				) {
					request_body.excludeDomains =
						params.exclude_domains.slice(0, 50);
				}

				if (search_params.date_after) {
					request_body.fromDate = new Date(
						search_params.date_after,
					).toISOString();
				}
				if (search_params.date_before) {
					request_body.toDate = new Date(
						search_params.date_before,
					).toISOString();
				}

				const data =
					await http_json<LinkupSourcedAnswerResponse>(
						this.name,
						`${config.ai_response.linkup_answer.base_url}/search`,
						{
							method: 'POST',
							headers: {
								Authorization: `Bearer ${api_key}`,
								'Content-Type': 'application/json',
							},
							body: JSON.stringify(request_body),
							signal: AbortSignal.timeout(
								config.ai_response.linkup_answer.timeout,
							),
						},
					);

				const results: SearchResult[] = [
					{
						title: 'Linkup Answer',
						url: 'https://linkup.so',
						snippet: data.answer,
						score: 1.0,
						source_provider: this.name,
					},
				];

				if (data.sources?.length) {
					results.push(
						...data.sources.map((source, index) => ({
							title: source.name,
							url: source.url,
							snippet: source.snippet,
							score: 0.9 - index * 0.1,
							source_provider: this.name,
							metadata: {
								favicon: source.favicon,
							},
						})),
					);
				}

				const filtered = results.filter(
					(r) => r.title && r.url && r.snippet,
				);

				return params.limit && params.limit > 0
					? filtered.slice(0, params.limit)
					: filtered;
			} catch (error) {
				handle_provider_error(
					error,
					this.name,
					'fetch AI response',
				);
			}
		};

		return retry_with_backoff(search_request);
	}
}
