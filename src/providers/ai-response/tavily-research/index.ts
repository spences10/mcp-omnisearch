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
	created_at: v.optional(v.string()),
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

const pending_result = (
	request_id: string,
	status: string,
): SearchResult[] => [
	{
		title: 'Tavily Research Task',
		url: '',
		snippet: `Research is ${status}. Call ai_search again with provider "tavily_research" and research_id "${request_id}" to retrieve the report.`,
		score: 1,
		source_provider: 'tavily_research',
		metadata: {
			type: 'research_task',
			request_id,
			status,
		},
	},
];

export class TavilyResearchProvider implements SearchProvider {
	name = 'tavily_research';
	description =
		'Start or retrieve asynchronous Tavily research with synthesized reports and sources.';

	async search(params: BaseSearchParams): Promise<SearchResult[]> {
		const api_key = validate_api_key(
			config.ai_response.tavily_research.api_key,
			this.name,
		);

		try {
			if (params.research_id) {
				const status = await this.get_status(
					params.research_id,
					api_key,
				);
				return this.map_status(status, params.limit);
			}

			const created = await retry_with_backoff(
				async () => {
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
								model: 'mini',
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
				},
				{ max_retries: 1, initial_delay: 250 },
			);

			return pending_result(created.request_id, created.status);
		} catch (error) {
			handle_provider_error(error, this.name, 'complete research');
		}
	}

	private async get_status(
		research_id: string,
		api_key: string,
	): Promise<TavilyResearchStatus> {
		return retry_with_backoff(
			async () => {
				const raw_status = await http_json(
					this.name,
					`${config.ai_response.tavily_research.base_url}/research/${research_id}`,
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
			},
			{ max_retries: 1, initial_delay: 250 },
		);
	}

	private map_status(
		status: TavilyResearchStatus,
		limit?: number,
	): SearchResult[] {
		if (status.status === 'failed') {
			throw new ProviderError(
				ErrorType.PROVIDER_ERROR,
				status.error || 'Tavily research task failed',
				this.name,
			);
		}
		if (status.status !== 'completed') {
			return pending_result(status.request_id, status.status);
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
		const source_limit = limit ?? status.sources.length;
		results.push(
			...status.sources
				.slice(0, source_limit)
				.map((source, index) => ({
					title: source.title,
					url: source.url,
					snippet: 'Source reference',
					score: 0.9 - index * 0.01,
					source_provider: this.name,
					metadata: { type: 'source', favicon: source.favicon },
				})),
		);
		return results;
	}
}
