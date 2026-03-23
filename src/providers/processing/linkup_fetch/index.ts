import { http_json } from '../../../common/http.js';
import {
	ProcessingProvider,
	ProcessingResult,
} from '../../../common/types.js';
import {
	aggregate_url_results,
	handle_provider_error,
	retry_with_backoff,
	validate_api_key,
	validate_processing_urls,
	type ProcessedUrlResult,
} from '../../../common/utils.js';
import { config } from '../../../config/env.js';

interface LinkupFetchResponse {
	markdown: string;
	rawHtml?: string;
	images?: string[];
}

export class LinkupFetchProvider implements ProcessingProvider {
	name = 'linkup_fetch';
	description =
		'Fetch and convert any webpage to clean markdown using Linkup. Supports JavaScript rendering for dynamic pages. Best for content extraction and LLM-ready text conversion.';

	async process_content(
		url: string | string[],
		extract_depth: 'basic' | 'advanced' = 'basic',
	): Promise<ProcessingResult> {
		const urls = validate_processing_urls(url, this.name);

		const fetch_request = async () => {
			const api_key = validate_api_key(
				config.processing.linkup_fetch.api_key,
				this.name,
			);

			try {
				const results: ProcessedUrlResult[] = await Promise.all(
					urls.map(async (single_url) => {
						try {
							const data =
								await http_json<LinkupFetchResponse>(
									this.name,
									`${config.processing.linkup_fetch.base_url}/fetch`,
									{
										method: 'POST',
										headers: {
											Authorization: `Bearer ${api_key}`,
											'Content-Type':
												'application/json',
										},
										body: JSON.stringify({
											url: single_url,
											renderJs:
												extract_depth === 'advanced',
										}),
										signal: AbortSignal.timeout(
											config.processing.linkup_fetch
												.timeout,
										),
									},
								);

							return {
								url: single_url,
								content: data.markdown || '',
								success: true,
							};
						} catch (error) {
							console.error(
								`Error fetching ${single_url}:`,
								error,
							);
							return {
								url: single_url,
								content: '',
								success: false,
								error:
									error instanceof Error
										? error.message
										: 'Unknown error',
							};
						}
					}),
				);

				return aggregate_url_results(
					results,
					this.name,
					urls,
					extract_depth,
				);
			} catch (error) {
				handle_provider_error(
					error,
					this.name,
					'fetch webpage content',
				);
			}
		};

		return retry_with_backoff(fetch_request);
	}
}
