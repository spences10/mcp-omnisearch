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

const you_contents_response_schema = v.array(
	v.object({
		url: v.optional(v.string()),
		title: v.optional(v.string()),
		markdown: v.optional(v.nullable(v.string())),
		html: v.optional(v.nullable(v.string())),
	}),
);

export class YouContentsProvider implements ProcessingProvider {
	name = 'you_contents';
	description =
		'Extract clean Markdown from one or more URLs using the You.com Contents API. Best for LLM-ready page text without a separate crawler.';

	async process_content(
		url: string | string[],
		extract_depth: 'basic' | 'advanced' = 'basic',
	): Promise<ProcessingResult> {
		const urls = validate_processing_urls(url, this.name);
		const api_key = validate_api_key(
			config.processing.you_contents.api_key,
			this.name,
		);

		const extract_request = async () => {
			try {
				const raw_data = await http_json(
					this.name,
					`${config.processing.you_contents.base_url}/v1/contents`,
					{
						method: 'POST',
						headers: {
							Accept: 'application/json',
							'Content-Type': 'application/json',
							'X-API-Key': api_key,
						},
						body: JSON.stringify({
							urls,
							formats:
								extract_depth === 'advanced'
									? ['markdown', 'metadata']
									: ['markdown'],
						}),
						signal: AbortSignal.timeout(
							config.processing.you_contents.timeout,
						),
					},
				);
				const data = parse_provider_response(
					this.name,
					you_contents_response_schema,
					raw_data,
				);

				const raw_contents = data
					.map((result, index) => ({
						url: result.url ?? urls[index] ?? urls[0],
						content: result.markdown || result.html || '',
					}))
					.filter((result) => result.content.length > 0);

				if (raw_contents.length === 0) {
					throw new ProviderError(
						ErrorType.PROVIDER_ERROR,
						'No content extracted from URL',
						this.name,
					);
				}

				const combined_content = raw_contents
					.map((result) => result.content)
					.join('\n\n');

				return {
					content: combined_content,
					raw_contents,
					metadata: {
						title: data[0]?.title,
						word_count: combined_content.split(/\s+/).filter(Boolean)
							.length,
						urls_processed: urls.length,
						successful_extractions: raw_contents.length,
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
