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
import { validate_processing_urls } from '../../../common/validation.js';
import { config } from '../../../config/env.js';
import {
	keenable_endpoint,
	keenable_fetch_public_url,
	keenable_fetch_url,
	keenable_headers,
} from '../../search/keenable/auth.js';

const keenable_fetch_response_schema = v.object({
	url: v.optional(v.string()),
	title: v.optional(v.string()),
	content: v.optional(v.string()),
	author: v.optional(v.string()),
});

export class KeenableExtractProvider implements ProcessingProvider {
	name = 'keenable_extract';
	description =
		'Fetch Markdown page content from Keenable. Keyed via KEENABLE_API_KEY, or opt into the shared public tier with KEENABLE_ALLOW_PUBLIC=1. Advanced extract_depth requests a live fetch.';

	async process_content(
		url: string | string[],
		extract_depth: 'basic' | 'advanced' = 'basic',
	): Promise<ProcessingResult> {
		const urls = validate_processing_urls(url, this.name);

		const extract_request = async () => {
			try {
				const pages = await Promise.all(
					urls.map(async (target) => {
						const endpoint = keenable_endpoint(
							config.processing.keenable_extract.api_key,
							config.processing.keenable_extract.allow_public,
							keenable_fetch_url(
								config.processing.keenable_extract.base_url,
								target,
							),
							keenable_fetch_public_url(
								config.processing.keenable_extract.base_url,
								target,
							),
						);
						const request_url =
							extract_depth === 'advanced'
								? `${endpoint}${endpoint.includes('?') ? '&' : '?'}live=true`
								: endpoint;

						const raw_data = await http_json(this.name, request_url, {
							method: 'GET',
							headers: keenable_headers(
								this.name,
								config.processing.keenable_extract.api_key,
								config.processing.keenable_extract.allow_public,
							),
							signal: AbortSignal.timeout(
								config.processing.keenable_extract.timeout,
							),
						});

						return parse_provider_response(
							this.name,
							keenable_fetch_response_schema,
							raw_data,
						);
					}),
				);

				const raw_contents = pages
					.map((page, index) => ({
						url: page.url ?? urls[index] ?? urls[0],
						content: page.content ?? '',
					}))
					.filter((page) => page.content.length > 0);

				if (raw_contents.length === 0) {
					throw new ProviderError(
						ErrorType.PROVIDER_ERROR,
						'No content extracted from URL',
						this.name,
					);
				}

				const combined_content = raw_contents
					.map((page) => page.content)
					.join('\n\n');

				return {
					content: combined_content,
					raw_contents,
					metadata: {
						title: pages[0]?.title,
						author: pages[0]?.author,
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
