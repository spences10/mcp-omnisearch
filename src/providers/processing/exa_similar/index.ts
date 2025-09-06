import {
	AbstractProcessingProvider,
	ProcessingOptions,
	ProcessingProviderConfig,
} from '../../../common/abstract-processing-provider.js';
import { ProcessingResult } from '../../../common/types.js';
import { config } from '../../../config/env.js';

interface ExaSimilarRequest {
	url: string;
	numResults?: number;
	contents?: {
		text?: { maxCharacters?: number };
		highlights?: boolean;
		summary?: boolean;
		livecrawl?: 'always' | 'fallback' | 'preferred';
	};
	includeDomains?: string[];
	excludeDomains?: string[];
}

interface ExaSimilarResult {
	id: string;
	title: string;
	url: string;
	text?: string;
	highlights?: string[];
	summary?: string;
	publishedDate?: string;
	author?: string;
	score?: number;
}

interface ExaSimilarResponse {
	results: ExaSimilarResult[];
	requestId: string;
}

export class ExaSimilarProvider extends AbstractProcessingProvider {
	readonly name = 'exa_similar';
	readonly description =
		'Find web pages semantically similar to a given URL using Exa';

	constructor() {
		const provider_config: ProcessingProviderConfig = {
			api_key: config.processing.exa_similar.api_key || '',
			base_url: config.processing.exa_similar.base_url,
			timeout: config.processing.exa_similar.timeout,
			auth_type: 'api-key',
			custom_headers: {
				'Content-Type': 'application/json',
			},
		};

		const processing_options: ProcessingOptions = {
			max_urls: 1, // This provider only accepts a single URL
			allow_single_url: true,
			allow_multiple_urls: false,
			url_validation_options: {
				require_https: false,
				allow_localhost: false,
			},
		};

		super(provider_config, 'exa_similar', processing_options);
	}

	async process_content(
		url: string | string[],
		extract_depth: 'basic' | 'advanced' = 'basic',
	): Promise<ProcessingResult> {
		// Use base class validation
		const { urls, validated_depth } = this.validate_input(
			url,
			extract_depth,
		);

		// This provider only accepts a single URL
		const target_url = urls[0];

		const process_request = async (): Promise<ProcessingResult> => {
			try {
				const request_body: ExaSimilarRequest = {
					url: target_url,
					numResults: validated_depth === 'advanced' ? 15 : 10,
					contents: {
						text: {
							maxCharacters:
								validated_depth === 'advanced' ? 3000 : 1500,
						},
						highlights: validated_depth === 'advanced',
						summary: validated_depth === 'advanced',
						livecrawl:
							validated_depth === 'advanced'
								? 'preferred'
								: 'fallback',
					},
				};

				const response =
					await this.http_client.post<ExaSimilarResponse>(
						'/findSimilar',
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
					if (result.score) {
						formatted_content += `**Similarity Score:** ${result.score.toFixed(
							3,
						)}\n`;
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
						formatted_content += `**Content Preview:**\n${result.text.substring(
							0,
							500,
						)}${result.text.length > 500 ? '...' : ''}\n\n`;
					} else {
						formatted_content += `${content.substring(0, 500)}${
							content.length > 500 ? '...' : ''
						}\n\n`;
					}

					return {
						url: result.url,
						content: formatted_content,
						title: result.title,
					};
				});

				// Use base class aggregation - add header
				const { combined_content, raw_contents, total_word_count } =
					this.aggregate_content(extracted_results, true);

				const enhanced_content = `# Similar Pages to ${target_url}\n\nFound ${data.results.length} similar pages:\n\n${combined_content}`;

				// Additional metadata
				const additional_metadata: Record<string, any> = {
					title: `Similar pages to ${target_url}`,
					word_count: total_word_count,
					successful_extractions: data.results.length,
					original_url: target_url,
					requestId: data.requestId,
				};

				// Use base class metadata calculation
				const metadata = this.calculate_metadata(
					urls,
					validated_depth,
					additional_metadata,
				);

				return {
					content: enhanced_content,
					raw_contents,
					metadata,
					source_provider: this.name,
				};
			} catch (error) {
				return this.error_handler.handle_unknown_error(
					error,
					'find similar pages',
				);
			}
		};

		return this.execute_with_retry(process_request);
	}
}
