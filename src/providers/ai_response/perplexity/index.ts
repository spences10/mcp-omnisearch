import { http_json } from '../../../common/http.js';
import {
	BaseSearchParams,
	SearchProvider,
	SearchResult,
} from '../../../common/types.js';
import {
	apply_search_operators,
	parse_search_operators,
	validate_api_key,
} from '../../../common/utils.js';
import { config } from '../../../config/env.js';

export interface PerplexityResponse {
	answer: string;
	context: {
		sources: Array<{
			title: string;
			url: string;
			content: string;
		}>;
		follow_up_questions?: string[];
	};
	metadata: {
		model: string;
		processing_time: number;
		token_count: number;
	};
}

export interface PerplexityOptions {
	model?: 'sonar-pro' | 'sonar' | 'sonar-reasoning' | 'r1-1776';
	max_tokens?: number;
	temperature?: number;
	include_sources?: boolean;
	include_follow_up?: boolean;
	top_p?: number;
	top_k?: number;
	presence_penalty?: number;
	frequency_penalty?: number;
	stream?: boolean;
}

export class PerplexityProvider implements SearchProvider {
	name = 'perplexity';
	description =
		'AI-powered response generation combining real-time web search with advanced language models. Best for complex queries requiring reasoning and synthesis across multiple sources. Features contextual memory for follow-up questions.';

	async search(params: BaseSearchParams): Promise<SearchResult[]> {
		// Parse search operators from the query
		const parsed_query = parse_search_operators(params.query);
		const search_params = apply_search_operators(parsed_query);

		const response = await this.get_answer(params.query, {
			include_sources: true,
			max_tokens: params.limit || 1024,
		}, {
			after: search_params.date_after,
			before: search_params.date_before,
		});

		// Return the full answer as a single result
		const results: SearchResult[] = [
			{
				title: 'Perplexity AI',
				url: 'https://perplexity.ai',
				snippet: response.answer,
				source_provider: this.name,
			},
		];

		// Add sources if available
		if (
			response.context?.sources &&
			response.context.sources.length > 0
		) {
			results.push(
				...response.context.sources.map((source) => ({
					title: source.title || 'Source',
					url: source.url || 'https://perplexity.ai',
					snippet: source.content,
					source_provider: this.name,
				})),
			);
		}

		// Filter out any results with missing required fields
		const filtered_results = results.filter(
			(result) => result.title && result.url && result.snippet,
		);

		// Respect the limit parameter
		if (params.limit && params.limit > 0) {
			return filtered_results.slice(0, params.limit);
		}

		return filtered_results;
	}

	async get_answer(
		query: string,
		options: PerplexityOptions = {},
		date_filters?: { after?: string; before?: string },
	): Promise<PerplexityResponse> {
		const api_key = validate_api_key(
			config.ai_response.perplexity.api_key,
			this.name,
		);

		const default_options: PerplexityOptions = {
			model: 'sonar-pro',
			max_tokens: 1024,
			temperature: 0.7,
			include_sources: true,
			include_follow_up: false,
			top_p: 0.8,
			top_k: 40,
		};

		const final_options = { ...default_options, ...options };

		try {
			const data = await http_json<any>(
				this.name,
				`${config.ai_response.perplexity.base_url}/chat/completions`,
				{
					method: 'POST',
					headers: {
						accept: 'application/json',
						'content-type': 'application/json',
						Authorization: `Bearer ${api_key}`,
					},
					body: JSON.stringify({
						model: 'sonar-pro',
						messages: [
							{
								role: 'user',
								content: query,
							},
						],
						temperature: 0.2,
						max_tokens: 1024,
						...(date_filters?.after && { search_after_date_filter: date_filters.after }),
						...(date_filters?.before && { search_before_date_filter: date_filters.before }),
					}),
					signal: AbortSignal.timeout(
						config.ai_response.perplexity.timeout,
					),
				},
			);

			// Extract the full content from choices
			if (!data.choices?.[0]?.message?.content) {
				throw new Error(
					'Invalid response format from Perplexity API',
				);
			}

			const answer = data.choices[0].message.content;
			const citations = data.citations || [];

			return {
				answer,
				context: {
					sources: citations.map((citation: string) => ({
						title: 'Citation',
						url: citation,
						content: 'Source citation',
					})),
					follow_up_questions: [],
				},
				metadata: {
					model: final_options.model!,
					processing_time: 0,
					token_count: data.usage?.total_tokens || 0,
				},
			};
		} catch (error: unknown) {
			const error_message =
				error instanceof Error ? error.message : String(error);
			throw new Error(
				`Failed to get Perplexity answer: ${error_message}`,
			);
		}
	}

	async get_answer_with_context(
		query: string,
		context: string,
		options: PerplexityOptions = {},
	): Promise<PerplexityResponse> {
		const api_key = validate_api_key(
			config.ai_response.perplexity.api_key,
			this.name,
		);

		const default_options: PerplexityOptions = {
			model: 'sonar-pro',
			max_tokens: 1024,
			temperature: 0.7,
			include_sources: true,
			include_follow_up: false,
			top_p: 0.8,
			top_k: 40,
		};

		const final_options = { ...default_options, ...options };

		try {
			const data = await http_json<any>(
				this.name,
				`${config.ai_response.perplexity.base_url}/chat/completions`,
				{
					method: 'POST',
					headers: {
						accept: 'application/json',
						'content-type': 'application/json',
						Authorization: `Bearer ${api_key}`,
					},
					body: JSON.stringify({
						model: 'sonar-pro',
						messages: [
							{
								role: 'system',
								content: context,
							},
							{
								role: 'user',
								content: query,
							},
						],
						max_tokens: final_options.max_tokens,
						temperature: final_options.temperature,
						top_p: final_options.top_p,
						top_k: final_options.top_k,
						presence_penalty: final_options.presence_penalty,
						frequency_penalty: final_options.frequency_penalty,
					}),
					signal: AbortSignal.timeout(
						config.ai_response.perplexity.timeout,
					),
				},
			);
			const answer = data.choices[0].message.content;
			const citations = data.citations || [];

			return {
				answer,
				context: {
					sources: citations.map((citation: string) => ({
						title: 'Citation',
						url: citation,
						content: 'Source citation',
					})),
					follow_up_questions: [],
				},
				metadata: {
					model: final_options.model!,
					processing_time: 0,
					token_count: data.usage?.total_tokens || 0,
				},
			};
		} catch (error: unknown) {
			const error_message =
				error instanceof Error ? error.message : String(error);
			throw new Error(
				`Failed to get Perplexity answer with context: ${error_message}`,
			);
		}
	}
}
