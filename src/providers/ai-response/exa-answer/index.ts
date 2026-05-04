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

interface ExaAnswerResponse {
	answer: string;
	citations?: Array<{
		id: string;
		title: string;
		url: string;
		publishedDate?: string;
		text?: string;
		image?: string;
		favicon?: string;
	}>;
	requestId: string;
	costDollars?: number;
}

export class ExaAnswerProvider implements SearchProvider {
	name = 'exa_answer';
	description =
		'Get direct AI-generated answers to questions using Exa Answer API';

	async search(params: BaseSearchParams): Promise<SearchResult[]> {
		const api_key = validate_api_key(
			config.ai_response.exa_answer.api_key,
			this.name,
		);

		const search_request = async () => {
			try {
				const data = await http_json<ExaAnswerResponse>(
					this.name,
					`${config.ai_response.exa_answer.base_url}/answer`,
					{
						method: 'POST',
						headers: {
							'x-api-key': api_key,
							'Content-Type': 'application/json',
						},
						body: JSON.stringify({
							query: sanitize_query(params.query),
						}),
						signal: AbortSignal.timeout(
							config.ai_response.exa_answer.timeout,
						),
					},
				);

				const results: SearchResult[] = [
					{
						title: 'AI Answer',
						url: '',
						snippet: data.answer,
						score: 1.0,
						source_provider: this.name,
						metadata: {
							requestId: data.requestId,
							type: 'ai_answer',
							citations_count: data.citations?.length || 0,
						},
					},
				];

				if (data.citations && data.citations.length > 0) {
					const limit = params.limit ?? data.citations.length;
					const citation_results = data.citations
						.slice(0, limit)
						.map((citation, index) => ({
							title: citation.title,
							url: citation.url,
							snippet: citation.text || 'Source reference',
							score: 0.9 - index * 0.01,
							source_provider: this.name,
							metadata: {
								id: citation.id,
								publishedDate: citation.publishedDate,
								type: 'citation',
							},
						}));
					results.push(...citation_results);
				}

				return results;
			} catch (error) {
				handle_provider_error(error, this.name, 'fetch AI response');
			}
		};

		return retry_with_backoff(search_request);
	}
}
