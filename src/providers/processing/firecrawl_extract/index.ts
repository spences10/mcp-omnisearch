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

interface FirecrawlExtractResponse {
	success: boolean;
	id: string;
	error?: string;
}

interface FirecrawlExtractStatusResponse {
	success: boolean;
	id: string;
	status: string;
	data?: any;
	error?: string;
}

export class FirecrawlExtractProvider implements ProcessingProvider {
	name = 'firecrawl_extract';
	description =
		'Structured data extraction with AI using natural language prompts via Firecrawl. Extracts specific information from web pages based on custom extraction instructions. Best for targeted data collection, information extraction, and converting unstructured web content into structured data.';

	async process_content(
		url: string | string[],
		extract_depth: 'basic' | 'advanced' = 'basic',
	): Promise<ProcessingResult> {
		// Extract works with a single URL at a time
		const urls = validate_processing_urls(url, this.name);
		const extract_url = urls[0];

		const extract_request = async () => {
			const api_key = validate_api_key(
				config.processing.firecrawl_extract.api_key,
				this.name,
			);

			try {
				// Define extraction instructions based on extract_depth
				const extraction_prompt =
					extract_depth === 'advanced'
						? 'Extract all relevant information from this page including: title, author, date published, main content, categories or tags, related links, and any structured data like product information, pricing, or specifications. Format the data in a well-structured way.'
						: 'Extract the main content, title, and author from this page. Summarize the key information.';

				// Start the extraction
				const extract_data =
					await make_firecrawl_request<FirecrawlExtractResponse>(
						this.name,
						config.processing.firecrawl_extract.base_url,
						api_key,
						{
							urls: [extract_url],
							prompt: extraction_prompt,
							showSources: true,
							scrapeOptions: {
								formats: ['markdown'],
								onlyMainContent: true,
								waitFor: extract_depth === 'advanced' ? 5000 : 2000,
							},
						},
						config.processing.firecrawl_extract.timeout,
					);

				validate_firecrawl_response(
					extract_data,
					this.name,
					'Error starting extraction',
				);

				// Poll for extraction completion
				const status_data =
					await poll_firecrawl_job<FirecrawlExtractStatusResponse>({
						provider_name: this.name,
						status_url: `${config.processing.firecrawl_extract.base_url}/${extract_data.id}`,
						api_key,
						max_attempts: 15,
						poll_interval: 3000,
						timeout: 30000,
					});

				// Verify we have data
				if (!status_data.data) {
					throw new ProviderError(
						ErrorType.PROVIDER_ERROR,
						'No data extracted from URL',
						this.name,
					);
				}

				// Format the extracted data as markdown
				let formatted_content = `# Extracted Data from ${extract_url}\n\n`;

				// Add each extracted field
				for (const [key, value] of Object.entries(status_data.data)) {
					if (typeof value === 'string') {
						formatted_content += `## ${key.charAt(0).toUpperCase() + key.slice(1)}\n\n${value}\n\n`;
					} else if (Array.isArray(value)) {
						formatted_content += `## ${key.charAt(0).toUpperCase() + key.slice(1)}\n\n`;
						value.forEach((item, index) => {
							if (typeof item === 'object') {
								formatted_content += `### Item ${index + 1}\n\n`;
								for (const [itemKey, itemValue] of Object.entries(
									item,
								)) {
									formatted_content += `- **${itemKey}**: ${String(itemValue)}\n`;
								}
								formatted_content += '\n';
							} else {
								formatted_content += `- ${item}\n`;
							}
						});
						formatted_content += '\n';
					} else if (typeof value === 'object' && value !== null) {
						formatted_content += `## ${key.charAt(0).toUpperCase() + key.slice(1)}\n\n`;
						for (const [subKey, subValue] of Object.entries(value)) {
							formatted_content += `- **${subKey}**: ${subValue}\n`;
						}
						formatted_content += '\n';
					}
				}

				// Create a single raw_content entry
				const raw_contents = [
					{
						url: extract_url,
						content: formatted_content,
					},
				];

				// Get title if available
				const title =
					status_data.data.title ||
					`Extracted Data from ${extract_url}`;

				// Count words in the formatted content
				const word_count = formatted_content
					.split(/\s+/)
					.filter(Boolean).length;

				return {
					content: formatted_content,
					raw_contents,
					metadata: {
						title,
						word_count,
						urls_processed: 1,
						successful_extractions: 1,
						extract_depth,
					},
					source_provider: this.name,
				};
			} catch (error) {
				handle_provider_error(error, this.name, 'extract data');
			}
		};

		return retry_with_backoff(extract_request);
	}
}
