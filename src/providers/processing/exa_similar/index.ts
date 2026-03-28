import { handle_provider_error } from '../../../common/errors.js';
import { http_json } from '../../../common/http.js';
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

interface ExaSimilarRequest {
	url: string;
	numResults?: number;
	contents?: {
		text?: { maxCharacters?: number };
		highlights?: boolean;
		summary?: boolean;
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

export class ExaSimilarProvider implements ProcessingProvider {
	name = 'exa_similar';
	description =
		'Find web pages semantically similar to a given URL using Exa';

	async process_content(
		url: string | string[],
		extract_depth: 'basic' | 'advanced' = 'basic',
	): Promise<ProcessingResult> {
		const api_key = validate_api_key(
			config.processing.exa_similar.api_key,
			this.name,
		);

		// This provider only accepts a single URL
		const target_url = Array.isArray(url) ? url[0] : url;

		if (!target_url) {
			throw new ProviderError(
				ErrorType.INVALID_INPUT,
				'A URL must be provided',
				this.name,
			);
		}

		// Validate URL format
		validate_processing_urls(target_url, this.name);

		const process_request = async () => {
			try {
				const request_body: ExaSimilarRequest = {
					url: target_url,
					numResults: extract_depth === 'advanced' ? 15 : 10,
					contents: {
						text: {
							maxCharacters:
								extract_depth === 'advanced' ? 3000 : 1500,
						},
						highlights: extract_depth === 'advanced',
						summary: extract_depth === 'advanced',
					},
				};

				const data = await http_json<ExaSimilarResponse>(
					this.name,
					`${config.processing.exa_similar.base_url}/findSimilar`,
					{
						method: 'POST',
						headers: {
							'x-api-key': api_key,
							Authorization: `Bearer ${api_key}`,
							'Content-Type': 'application/json',
						},
						body: JSON.stringify(request_body),
					},
				);

				// Combine all content
				let combined_content = `# Similar Pages to ${target_url}\n\n`;
				combined_content += `Found ${data.results.length} similar pages:\n\n`;

				const raw_contents: Array<{ url: string; content: string }> =
					[];
				let total_word_count = 0;

				for (const result of data.results) {
					const content =
						result.text || result.summary || 'No content available';
					const word_count = content.split(/\s+/).length;
					total_word_count += word_count;

					// Add to combined content
					combined_content += `## ${result.title}\n\n`;
					if (result.author) {
						combined_content += `**Author:** ${result.author}\n`;
					}
					if (result.publishedDate) {
						combined_content += `**Published:** ${result.publishedDate}\n`;
					}
					if (result.score) {
						combined_content += `**Similarity Score:** ${result.score.toFixed(
							3,
						)}\n`;
					}
					combined_content += `**URL:** ${result.url}\n\n`;

					if (result.highlights && result.highlights.length > 0) {
						combined_content += `**Key Highlights:**\n`;
						for (const highlight of result.highlights) {
							combined_content += `- ${highlight}\n`;
						}
						combined_content += '\n';
					}

					if (result.summary && result.text) {
						combined_content += `**Summary:** ${result.summary}\n\n`;
						combined_content += `**Content Preview:**\n${result.text.substring(
							0,
							500,
						)}${result.text.length > 500 ? '...' : ''}\n\n`;
					} else {
						combined_content += `${content.substring(0, 500)}${
							content.length > 500 ? '...' : ''
						}\n\n`;
					}

					combined_content += '---\n\n';

					// Add to raw contents
					raw_contents.push({
						url: result.url,
						content: content,
					});
				}

				return {
					content: combined_content,
					raw_contents,
					metadata: {
						title: `Similar pages to ${target_url}`,
						word_count: total_word_count,
						urls_processed: data.results.length,
						successful_extractions: data.results.length,
						extract_depth,
						original_url: target_url,
						requestId: data.requestId,
					},
					source_provider: this.name,
				};
			} catch (error) {
				handle_provider_error(error, this.name, 'find similar pages');
			}
		};

		return retry_with_backoff(process_request);
	}
}
