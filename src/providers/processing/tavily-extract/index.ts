import * as v from 'valibot';
import {
	handle_provider_error,
	sanitize_query,
} from '../../../common/errors.js';
import { http_json } from '../../../common/http.js';
import { parse_provider_response } from '../../../common/provider-response.js';
import { retry_with_backoff } from '../../../common/retry.js';
import {
	ErrorType,
	ProcessingOptions,
	ProcessingProvider,
	ProcessingResult,
	ProviderError,
} from '../../../common/types.js';
import {
	validate_api_key,
	validate_processing_urls,
} from '../../../common/validation.js';
import { config } from '../../../config/env.js';

const tavily_extract_response_schema = v.object({
	results: v.array(
		v.object({
			url: v.string(),
			raw_content: v.string(),
			images: v.optional(v.array(v.string())),
			favicon: v.optional(v.string()),
		}),
	),
	failed_results: v.array(
		v.object({
			url: v.string(),
			error: v.string(),
		}),
	),
	response_time: v.union([v.number(), v.string()]),
	request_id: v.optional(v.string()),
	usage: v.optional(
		v.object({
			credits: v.number(),
		}),
	),
});

export class TavilyExtractProvider implements ProcessingProvider {
	name = 'tavily_extract';
	description =
		'Extract web page content from single or multiple URLs using Tavily Extract. Efficiently converts web content into clean, processable text with configurable extraction depth and optional image extraction. Returns both combined and individual URL content. Best for content analysis, data collection, and research.';

	async process_content(
		url: string | string[],
		extract_depth: 'basic' | 'advanced' = 'basic',
		options: ProcessingOptions = {},
	): Promise<ProcessingResult> {
		const urls = validate_processing_urls(url, this.name);

		if (options.chunks_per_source !== undefined && !options.query) {
			throw new ProviderError(
				ErrorType.INVALID_INPUT,
				'query is required when chunks_per_source is provided',
				this.name,
			);
		}

		const extract_request = async () => {
			const api_key = validate_api_key(
				config.processing.tavily_extract.api_key,
				this.name,
			);

			try {
				const request_body = {
					urls,
					include_images: false,
					include_favicon: true,
					include_usage: true,
					extract_depth,
					format: options.format ?? 'markdown',
					...(options.query
						? { query: sanitize_query(options.query) }
						: {}),
					...(options.chunks_per_source !== undefined
						? { chunks_per_source: options.chunks_per_source }
						: {}),
				};
				const raw_data = await http_json(
					this.name,
					`${config.processing.tavily_extract.base_url}/extract`,
					{
						method: 'POST',
						headers: {
							Authorization: `Bearer ${api_key}`,
							'Content-Type': 'application/json',
						},
						body: JSON.stringify(request_body),
						signal: AbortSignal.timeout(
							config.processing.tavily_extract.timeout,
						),
					},
				);
				const data = parse_provider_response(
					this.name,
					tavily_extract_response_schema,
					raw_data,
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

				const favicons = Object.fromEntries(
					data.results
						.filter((result) => result.favicon)
						.map((result) => [result.url, result.favicon]),
				);

				// Include any failed URLs in metadata
				const failed_urls =
					data.failed_results.length > 0
						? data.failed_results.map((f) => f.url)
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
						response_time: data.response_time,
						...(data.request_id
							? { request_id: data.request_id }
							: {}),
						...(data.usage ? { usage: data.usage } : {}),
						...(Object.keys(favicons).length > 0 ? { favicons } : {}),
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
