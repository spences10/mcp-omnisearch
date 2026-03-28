import { handle_provider_error } from '../../../common/errors.js';
import { http_json } from '../../../common/http.js';
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

interface TavilyExtractResponse {
	results: {
		url: string;
		raw_content: string;
		images?: {
			url: string;
			alt_text?: string;
		}[];
	}[];
	failed_results: string[];
	response_time: number;
}

export class TavilyExtractProvider implements ProcessingProvider {
	name = 'tavily_extract';
	description =
		'Extract web page content from single or multiple URLs using Tavily Extract. Efficiently converts web content into clean, processable text with configurable extraction depth and optional image extraction. Returns both combined and individual URL content. Best for content analysis, data collection, and research.';

	async process_content(
		url: string | string[],
		extract_depth: 'basic' | 'advanced' = 'basic',
	): Promise<ProcessingResult> {
		const urls = validate_processing_urls(url, this.name);

		const extract_request = async () => {
			const api_key = validate_api_key(
				config.processing.tavily_extract.api_key,
				this.name,
			);

			try {
				const data = await http_json<TavilyExtractResponse>(
					this.name,
					`${config.processing.tavily_extract.base_url}/extract`,
					{
						method: 'POST',
						headers: {
							Authorization: `Bearer ${api_key}`,
							'Content-Type': 'application/json',
						},
						body: JSON.stringify({
							urls: urls,
							include_images: false,
							extract_depth,
						}),
						signal: AbortSignal.timeout(
							config.processing.tavily_extract.timeout,
						),
					},
				);

				// Check if there are any results
				if (data.results.length === 0) {
					throw new ProviderError(
						ErrorType.PROVIDER_ERROR,
						'No content extracted from URL',
						this.name,
					);
				}

				// Map results to raw_contents array
				const raw_contents = data.results.map((result) => ({
					url: result.url,
					content: result.raw_content,
				}));

				// Combine all results into a single content string
				const combined_content = raw_contents
					.map((result) => result.content)
					.join('\n\n');

				// Calculate total word count
				const word_count = combined_content
					.split(/\s+/)
					.filter(Boolean).length;

				// Include any failed URLs in metadata
				const failed_urls =
					data.failed_results.length > 0
						? data.failed_results
						: undefined;

				return {
					content: combined_content,
					raw_contents,
					metadata: {
						word_count,
						failed_urls,
						urls_processed: urls.length,
						successful_extractions: data.results.length,
						extract_depth,
					},
					source_provider: this.name,
				};
			} catch (error) {
				handle_provider_error(error, this.name, 'extract content');
			}
		};

		return retry_with_backoff(extract_request);
	}
}
