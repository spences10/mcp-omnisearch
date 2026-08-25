import * as v from 'valibot';
import { handle_provider_error } from '../../../common/errors.js';
import { http_json } from '../../../common/http.js';
import { parse_provider_response } from '../../../common/provider-response.js';
import { retry_with_backoff } from '../../../common/retry.js';
import {
	ErrorType,
	ProcessingProvider,
	ProcessingResult,
	ProviderError,
} from '../../../common/types.js';
import {
	validate_api_key,
	validate_processing_urls,
} from '../../../common/validation.js';
import { config } from '../../../config/env.js';

const tavily_map_response_schema = v.object({
	base_url: v.string(),
	results: v.array(v.string()),
	response_time: v.number(),
});

export class TavilyMapProvider implements ProcessingProvider {
	name = 'tavily_map';
	description =
		'Discover URLs and site structure with Tavily Map. Best for fast site discovery before targeted extraction or crawling.';

	async process_content(
		url: string | string[],
		extract_depth: 'basic' | 'advanced' = 'basic',
	): Promise<ProcessingResult> {
		const [map_url] = validate_processing_urls(url, this.name);

		const map_request = async () => {
			const api_key = validate_api_key(
				config.processing.tavily_map.api_key,
				this.name,
			);

			try {
				const raw_data = await http_json(
					this.name,
					`${config.processing.tavily_map.base_url}/map`,
					{
						method: 'POST',
						headers: {
							Authorization: `Bearer ${api_key}`,
							'Content-Type': 'application/json',
						},
						body: JSON.stringify({
							url: map_url,
							max_depth: extract_depth === 'advanced' ? 3 : 1,
							max_breadth: extract_depth === 'advanced' ? 50 : 20,
							limit: extract_depth === 'advanced' ? 200 : 50,
						}),
						signal: AbortSignal.timeout(
							config.processing.tavily_map.timeout,
						),
					},
				);
				const data = parse_provider_response(
					this.name,
					tavily_map_response_schema,
					raw_data,
				);

				if (data.results.length === 0) {
					throw new ProviderError(
						ErrorType.PROVIDER_ERROR,
						'No URLs discovered during mapping',
						this.name,
					);
				}

				const content =
					`# Site Map for ${map_url}\n\n` +
					data.results.map((result) => `- ${result}`).join('\n');

				return {
					content,
					raw_contents: [{ url: map_url, content }],
					metadata: {
						title: `Site Map for ${map_url}`,
						word_count: data.results.length,
						urls_processed: 1,
						successful_extractions: data.results.length,
						extract_depth,
					},
					source_provider: this.name,
				};
			} catch (error) {
				handle_provider_error(error, this.name, 'map website');
			}
		};

		return retry_with_backoff(map_request);
	}
}
