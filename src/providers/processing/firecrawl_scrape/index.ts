import { handle_provider_error } from '../../../common/errors.js';
import {
	make_firecrawl_request,
	validate_firecrawl_response,
} from '../../../common/firecrawl_utils.js';
import {
	aggregate_url_results,
	type ProcessedUrlResult,
} from '../../../common/results.js';
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

interface FirecrawlScrapeResponse {
	success: boolean;
	data?: {
		markdown?: string;
		html?: string;
		rawHtml?: string;
		screenshot?: string;
		links?: string[];
		metadata?: {
			title?: string;
			description?: string;
			language?: string;
			sourceURL?: string;
			statusCode?: number;
			error?: string;
			[key: string]: any;
		};
		llm_extraction?: any;
		warning?: string;
	};
	error?: string;
}

export class FirecrawlScrapeProvider implements ProcessingProvider {
	name = 'firecrawl_scrape';
	description =
		'Extract clean, LLM-ready data from single URLs with enhanced formatting options using Firecrawl. Efficiently converts web content into markdown, plain text, or structured data with configurable extraction options. Best for content analysis, data collection, and AI training data preparation.';

	async process_content(
		url: string | string[],
		extract_depth: 'basic' | 'advanced' = 'basic',
	): Promise<ProcessingResult> {
		const urls = validate_processing_urls(url, this.name);

		const scrape_request = async () => {
			const api_key = validate_api_key(
				config.processing.firecrawl_scrape.api_key,
				this.name,
			);

			try {
				// Process each URL and collect results
				const results: ProcessedUrlResult[] = await Promise.all(
					urls.map(async (single_url) => {
						try {
							const data =
								await make_firecrawl_request<FirecrawlScrapeResponse>(
									this.name,
									config.processing.firecrawl_scrape.base_url,
									api_key,
									{
										url: single_url,
										formats: ['markdown'],
										onlyMainContent: true,
										waitFor:
											extract_depth === 'advanced' ? 5000 : 2000,
									},
									config.processing.firecrawl_scrape.timeout,
								);

							validate_firecrawl_response(
								data,
								this.name,
								'Error scraping URL',
							);

							// Check if we have data
							if (!data.data) {
								throw new ProviderError(
									ErrorType.PROVIDER_ERROR,
									'No data returned from API',
									this.name,
								);
							}

							// Check if content was successfully extracted
							if (
								!data.data.markdown &&
								!data.data.html &&
								!data.data.rawHtml
							) {
								throw new ProviderError(
									ErrorType.PROVIDER_ERROR,
									'No content extracted from URL',
									this.name,
								);
							}

							// Prefer markdown, fallback to HTML, then rawHtml
							const content =
								data.data.markdown ||
								data.data.html ||
								data.data.rawHtml ||
								'';

							return {
								url: single_url,
								content,
								metadata: data.data.metadata,
								success: true,
							};
						} catch (error) {
							// Log the error but continue processing other URLs
							console.error(`Error processing ${single_url}:`, error);
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
				handle_provider_error(error, this.name, 'extract content');
			}
		};

		return retry_with_backoff(scrape_request);
	}
}
