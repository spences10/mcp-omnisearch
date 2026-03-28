import { handle_provider_error } from '../../../common/errors.js';
import {
	make_firecrawl_request,
	poll_firecrawl_job,
	validate_firecrawl_response,
} from '../../../common/firecrawl_utils.js';
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

interface FirecrawlCrawlResponse {
	success: boolean;
	id: string;
	url: string;
	error?: string;
}

interface FirecrawlCrawlStatusResponse {
	success: boolean;
	id: string;
	status: string;
	total?: number;
	data?: Array<{
		url: string;
		markdown?: string;
		html?: string;
		rawHtml?: string;
		metadata?: {
			title?: string;
			description?: string;
			language?: string;
			sourceURL?: string;
			statusCode?: number;
			error?: string;
			[key: string]: any;
		};
		error?: string;
	}>;
	error?: string;
}

export class FirecrawlCrawlProvider implements ProcessingProvider {
	name = 'firecrawl_crawl';
	description =
		'Deep crawling of all accessible subpages on a website with configurable depth limits using Firecrawl. Efficiently discovers and extracts content from multiple pages within a domain. Best for comprehensive site analysis, content indexing, and data collection from entire websites.';

	async process_content(
		url: string | string[],
		extract_depth: 'basic' | 'advanced' = 'basic',
	): Promise<ProcessingResult> {
		// Crawl only works with a single URL (the starting point)
		const urls = validate_processing_urls(url, this.name);
		const crawl_url = urls[0];

		const crawl_request = async () => {
			const api_key = validate_api_key(
				config.processing.firecrawl_crawl.api_key,
				this.name,
			);

			try {
				// Start the crawl
				const crawl_data =
					await make_firecrawl_request<FirecrawlCrawlResponse>(
						this.name,
						config.processing.firecrawl_crawl.base_url,
						api_key,
						{
							url: crawl_url,
							scrapeOptions: {
								formats: ['markdown'],
								onlyMainContent: true,
							},
							maxDepth: extract_depth === 'advanced' ? 3 : 1,
							limit: extract_depth === 'advanced' ? 50 : 20,
						},
						config.processing.firecrawl_crawl.timeout,
					);

				validate_firecrawl_response(
					crawl_data,
					this.name,
					'Error starting crawl',
				);

				// Poll for crawl completion
				const status_data =
					await poll_firecrawl_job<FirecrawlCrawlStatusResponse>({
						provider_name: this.name,
						status_url: `${config.processing.firecrawl_crawl.base_url}/${crawl_data.id}`,
						api_key,
						max_attempts: 20,
						poll_interval: 5000,
						timeout: 30000,
					});

				// Verify we have data
				if (!status_data.data || status_data.data.length === 0) {
					throw new ProviderError(
						ErrorType.PROVIDER_ERROR,
						'Crawl returned no data',
						this.name,
					);
				}

				// Filter out failed pages
				const successful_pages = status_data.data.filter(
					(page) =>
						!page.error &&
						(page.markdown || page.html || page.rawHtml),
				);

				if (successful_pages.length === 0) {
					throw new ProviderError(
						ErrorType.PROVIDER_ERROR,
						'All crawled pages failed to extract content',
						this.name,
					);
				}

				// Map results to raw_contents array
				const raw_contents = successful_pages.map((page) => ({
					url: page.url,
					content: page.markdown || page.html || page.rawHtml || '',
				}));

				// Combine all results into a single content string
				const combined_content = raw_contents
					.map(
						(result) =>
							`# ${result.url}\n\n${result.content}\n\n---\n\n`,
					)
					.join('\n\n');

				// Calculate total word count
				const word_count = combined_content
					.split(/\s+/)
					.filter(Boolean).length;

				// Get title from first successful result if available
				const title = successful_pages[0]?.metadata?.title;

				// Track failed URLs
				const failed_urls = status_data.data
					.filter((page) => page.error)
					.map((page) => page.url);

				return {
					content: combined_content,
					raw_contents,
					metadata: {
						title,
						word_count,
						failed_urls:
							failed_urls.length > 0 ? failed_urls : undefined,
						urls_processed: status_data.data.length,
						successful_extractions: successful_pages.length,
						extract_depth,
					},
					source_provider: this.name,
				};
			} catch (error) {
				handle_provider_error(error, this.name, 'crawl website');
			}
		};

		return retry_with_backoff(crawl_request);
	}
}
