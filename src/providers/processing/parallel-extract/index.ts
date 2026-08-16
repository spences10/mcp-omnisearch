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

const parallel_extract_response_schema = v.object({
	results: v.array(
		v.object({
			url: v.string(),
			title: v.optional(v.nullable(v.string())),
			excerpts: v.optional(v.array(v.string())),
			full_content: v.optional(v.nullable(v.string())),
		}),
	),
	errors: v.optional(
		v.array(
			v.object({
				url: v.string(),
			}),
		),
	),
});

export class ParallelExtractProvider implements ProcessingProvider {
	name = 'parallel_extract';
	description =
		'Extract long Markdown excerpts or full page content from URLs using Parallel Extract. Use advanced extract_depth for full_content. Pricing can be surprising, so this provider stays explicit-only.';

	async process_content(
		url: string | string[],
		extract_depth: 'basic' | 'advanced' = 'basic',
	): Promise<ProcessingResult> {
		const urls = validate_processing_urls(url, this.name);
		const api_key = validate_api_key(
			config.processing.parallel_extract.api_key,
			this.name,
		);

		const extract_request = async () => {
			try {
				const raw_data = await http_json(
					this.name,
					`${config.processing.parallel_extract.base_url}/v1/extract`,
					{
						method: 'POST',
						headers: {
							Accept: 'application/json',
							'Content-Type': 'application/json',
							'x-api-key': api_key,
						},
						body: JSON.stringify({
							urls,
							advanced_settings: {
								full_content: extract_depth === 'advanced',
							},
						}),
						signal: AbortSignal.timeout(
							config.processing.parallel_extract.timeout,
						),
					},
				);
				const data = parse_provider_response(
					this.name,
					parallel_extract_response_schema,
					raw_data,
				);

				const raw_contents = data.results
					.map((result) => ({
						url: result.url,
						content:
							result.full_content ||
							(result.excerpts ?? []).join('\n\n'),
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
						title: data.results[0]?.title ?? undefined,
						word_count: combined_content.split(/\s+/).filter(Boolean)
							.length,
						failed_urls:
							data.errors && data.errors.length > 0
								? data.errors.map((error) => error.url)
								: undefined,
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
