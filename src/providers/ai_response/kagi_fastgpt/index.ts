import { http_json } from '../../../common/http.js';
import {
	BaseSearchParams,
	SearchProvider,
	SearchResult,
} from '../../../common/types.js';
import { validate_api_key } from '../../../common/validation.js';
import { config } from '../../../config/env.js';

export interface KagiFastGPTResponse {
	meta: {
		id: string;
		node: string;
		ms: number;
	};
	data: {
		output: string;
		tokens: number;
		references: Array<{
			title: string;
			snippet: string;
			url: string;
		}>;
	};
}

export interface KagiFastGPTOptions {
	cache?: boolean;
	web_search?: boolean;
}

export class KagiFastGPTProvider implements SearchProvider {
	name = 'kagi_fastgpt';
	description =
		'Quick AI-generated answers with citations, optimized for rapid response (900ms typical start time). Runs full search underneath for enriched answers.';

	async search(params: BaseSearchParams): Promise<SearchResult[]> {
		const response = await this.get_answer(params.query);

		const results: SearchResult[] = [];

		// Add the main answer as first result
		results.push({
			title: 'Kagi FastGPT Response',
			url: 'https://kagi.com/fastgpt',
			snippet: response.data.output,
			source_provider: this.name,
		});

		// Add references if available
		if (
			response.data.references &&
			response.data.references.length > 0
		) {
			results.push(
				...response.data.references.map((ref) => ({
					title: ref.title,
					url: ref.url,
					snippet: ref.snippet,
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
		options: KagiFastGPTOptions = {},
	): Promise<KagiFastGPTResponse> {
		const api_key = validate_api_key(
			config.ai_response.kagi_fastgpt.api_key,
			this.name,
		);

		const default_options: KagiFastGPTOptions = {
			cache: true,
			web_search: true, // Currently only true is supported
		};

		const final_options = { ...default_options, ...options };

		try {
			return await http_json<KagiFastGPTResponse>(
				this.name,
				'https://kagi.com/api/v0/fastgpt',
				{
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						Authorization: `Bot ${api_key}`,
					},
					body: JSON.stringify({
						query,
						cache: final_options.cache,
						web_search: final_options.web_search,
					}),
					signal: AbortSignal.timeout(
						config.ai_response.kagi_fastgpt.timeout,
					),
				},
			);
		} catch (error: unknown) {
			const error_message =
				error instanceof Error ? error.message : String(error);
			throw new Error(
				`Failed to get Kagi FastGPT answer: ${error_message}`,
			);
		}
	}
}
