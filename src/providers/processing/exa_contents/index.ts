import {
	AbstractProcessingProvider,
	ProcessingOptions,
	ProcessingProviderConfig,
} from '../../../common/abstract-processing-provider.js';
import { ProcessingResult } from '../../../common/types.js';
import { config } from '../../../config/env.js';

interface ExaContentsRequest {
	ids: string[];
	text?: boolean;
	highlights?: boolean;
	summary?: boolean;
	livecrawl?: 'always' | 'fallback' | 'preferred';
}

interface ExaContentResult {
	id: string;
	title: string;
	url: string;
	text?: string;
	highlights?: string[];
	summary?: string;
	publishedDate?: string;
	author?: string;
}

interface ExaContentsResponse {
	results: ExaContentResult[];
	requestId: string;
}

export class ExaContentsProvider extends AbstractProcessingProvider {
	readonly name = 'exa_contents';
	readonly description =
		'Extract full content from Exa search result IDs';

	constructor() {
		const provider_config: ProcessingProviderConfig = {
			api_key: config.processing.exa_contents.api_key || '',
			base_url: config.processing.exa_contents.base_url,
			timeout: config.processing.exa_contents.timeout,
			auth_type: 'api-key',
			custom_headers: {
				'Content-Type': 'application/json',
			},
		};

		const processing_options: ProcessingOptions = {
			max_urls: 50, // Exa can handle more IDs
			allow_single_url: true,
			allow_multiple_urls: true,
			// Exa contents doesn't work with URLs, it works with IDs
			// But we'll use the validation for consistency
		};

		super(provider_config, 'exa_contents', processing_options);
	}

	async process_content(
		ids: string | string[],
		extract_depth: 'basic' | 'advanced' = 'basic',
	): Promise<ProcessingResult> {
		// Validate input - IDs instead of URLs
		const id_array = Array.isArray(ids) ? ids : [ids];

		if (id_array.length === 0) {
			this.error_handler.handle_validation_error(
				'At least one ID must be provided',
			);
		}

		if (id_array.length > (this.processing_options.max_urls || 50)) {
			this.error_handler.handle_validation_error(
				`Cannot process more than ${
					this.processing_options.max_urls || 50
				} IDs at once`,
			);
		}

		const process_request = async (): Promise<ProcessingResult> => {
			try {
				const request_body: ExaContentsRequest = {
					ids: id_array,
					text: true,
					highlights: extract_depth === 'advanced',
					summary: extract_depth === 'advanced',
					livecrawl:
						extract_depth === 'advanced' ? 'preferred' : 'fallback',
				};

				const response =
					await this.http_client.post<ExaContentsResponse>(
						'/contents',
						request_body,
						this.name,
					);

				const data = response.data;

				// Map results to expected format for aggregation
				const extracted_results = data.results.map((result) => {
					const content =
						result.text || result.summary || 'No content available';

					// Build rich content with metadata
					let formatted_content = `## ${result.title}\n\n`;
					if (result.author) {
						formatted_content += `**Author:** ${result.author}\n`;
					}
					if (result.publishedDate) {
						formatted_content += `**Published:** ${result.publishedDate}\n`;
					}
					formatted_content += `**URL:** ${result.url}\n\n`;

					if (result.highlights && result.highlights.length > 0) {
						formatted_content += `**Key Highlights:**\n`;
						for (const highlight of result.highlights) {
							formatted_content += `- ${highlight}\n`;
						}
						formatted_content += '\n';
					}

					if (result.summary && result.text) {
						formatted_content += `**Summary:** ${result.summary}\n\n`;
						formatted_content += `**Full Content:**\n${result.text}\n\n`;
					} else {
						formatted_content += `${content}\n\n`;
					}

					return {
						url: result.url,
						content: formatted_content,
						title: result.title,
					};
				});

				// Use base class aggregation
				const { combined_content, raw_contents, total_word_count } =
					this.aggregate_content(extracted_results, true);

				// Additional metadata
				const additional_metadata: Record<string, any> = {
					title: `Content from ${data.results.length} Exa results`,
					word_count: total_word_count,
					successful_extractions: data.results.length,
					requestId: data.requestId,
				};

				// Use base class metadata calculation (using IDs instead of URLs)
				const metadata = this.calculate_metadata(
					id_array, // Pass IDs instead of URLs for this provider
					extract_depth,
					additional_metadata,
				);

				return {
					content: combined_content,
					raw_contents,
					metadata,
					source_provider: this.name,
				};
			} catch (error) {
				return this.error_handler.handle_unknown_error(
					error,
					'extract contents',
				);
			}
		};

		return this.execute_with_retry(process_request);
	}
}
