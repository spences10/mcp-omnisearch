import * as v from 'valibot';
import {
	handle_provider_error,
	sanitize_query,
} from '../../../common/errors.js';
import { http_json } from '../../../common/http.js';
import { parse_provider_response } from '../../../common/provider-response.js';
import { retry_with_backoff } from '../../../common/retry.js';
import {
	BaseSearchParams,
	ErrorType,
	ProviderError,
	SearchProvider,
	SearchResult,
} from '../../../common/types.js';
import { validate_api_key } from '../../../common/validation.js';
import { config } from '../../../config/env.js';

const tavily_research_created_schema = v.object({
	request_id: v.string(),
	status: v.string(),
});

const tavily_research_status_schema = v.variant('status', [
	v.object({
		request_id: v.string(),
		status: v.literal('completed'),
		content: v.string(),
		sources: v.array(
			v.object({
				title: v.string(),
				url: v.string(),
				favicon: v.optional(v.string()),
			}),
		),
		response_time: v.number(),
	}),
	v.object({
		request_id: v.string(),
		status: v.literal('failed'),
		error: v.optional(v.string()),
		response_time: v.optional(v.number()),
	}),
	v.object({
		request_id: v.string(),
		status: v.picklist(['pending', 'in_progress']),
		response_time: v.optional(v.number()),
	}),
]);

type TavilyResearchStatus = v.InferOutput<
	typeof tavily_research_status_schema
>;

const wait = (milliseconds: number) =>
	new Promise((resolve) => setTimeout(resolve, milliseconds));

export class TavilyResearchProvider implements SearchProvider {
	name = 'tavily_research';
	description =
		'Run comprehensive Tavily research that performs multiple searches and returns a synthesized report with sources.';

	async search(params: BaseSearchParams): Promise<SearchResult[]> {
		const api_key = validate_api_key(
			config.ai_response.tavily_research.api_key,
			this.name,
		);

		try {
			const created = await retry_with_backoff(async () => {
				const raw_created = await http_json(
					this.name,
					`${config.ai_response.tavily_research.base_url}/research`,
					{
						method: 'POST',
						headers: {
							Authorization: `Bearer ${api_key}`,
							'Content-Type': 'application/json',
						},
						body: JSON.stringify({
							input: sanitize_query(params.query),
							model: 'auto',
							stream: false,
							citation_format: 'numbered',
							output_length: 'standard',
						}),
						signal: AbortSignal.timeout(
							config.ai_response.tavily_research.request_timeout,
						),
					},
				);
				return parse_provider_response(
					this.name,
					tavily_research_created_schema,
					raw_created,
				);
			});

			const deadline =
				Date.now() + config.ai_response.tavily_research.timeout;
			let status: TavilyResearchStatus;

			do {
				status = await retry_with_backoff(async () => {
					const raw_status = await http_json(
						this.name,
						`${config.ai_response.tavily_research.base_url}/research/${created.request_id}`,
						{
							headers: { Authorization: `Bearer ${api_key}` },
							expectedStatuses: [202],
							signal: AbortSignal.timeout(
								config.ai_response.tavily_research.request_timeout,
							),
						},
					);
					return parse_provider_response(
						this.name,
						tavily_research_status_schema,
						raw_status,
					);
				});

				if (status.status === 'failed') {
					throw new ProviderError(
						ErrorType.PROVIDER_ERROR,
						status.error || 'Tavily research task failed',
						this.name,
					);
				}
				if (status.status !== 'completed') {
					await wait(
						config.ai_response.tavily_research.poll_interval,
					);
				}
			} while (
				status.status !== 'completed' &&
				Date.now() < deadline
			);

			if (status.status !== 'completed') {
				throw new ProviderError(
					ErrorType.TIMEOUT,
					'Tavily research task timed out',
					this.name,
					{ retryable: false },
				);
			}

			const results: SearchResult[] = [
				{
					title: 'Tavily Research Report',
					url: '',
					snippet: status.content,
					score: 1,
					source_provider: this.name,
					metadata: {
						type: 'ai_answer',
						request_id: status.request_id,
						response_time: status.response_time,
						sources_count: status.sources.length,
					},
				},
			];
			const limit = params.limit ?? status.sources.length;
			results.push(
				...status.sources.slice(0, limit).map((source, index) => ({
					title: source.title,
					url: source.url,
					snippet: 'Source reference',
					score: 0.9 - index * 0.01,
					source_provider: this.name,
					metadata: { type: 'source', favicon: source.favicon },
				})),
			);

			return results;
		} catch (error) {
			handle_provider_error(error, this.name, 'complete research');
		}
	}
}
