import { handle_provider_error } from '../../../common/errors.js';
import {
	make_firecrawl_request,
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

interface FirecrawlMapResponse {
	success: boolean;
	links?: string[];
	error?: string;
}

export class FirecrawlMapProvider implements ProcessingProvider {
	name = 'firecrawl_map';
	description =
		'Fast URL collection from websites for comprehensive site mapping using Firecrawl. Efficiently discovers all accessible URLs within a domain without extracting content. Best for site auditing, URL discovery, and preparing for targeted content extraction.';

	async process_content(
		url: string | string[],
		extract_depth: 'basic' | 'advanced' = 'basic',
	): Promise<ProcessingResult> {
		// Map only works with a single URL (the starting point)
		const urls = validate_processing_urls(url, this.name);
		const map_url = urls[0];

		const map_request = async () => {
			const api_key = validate_api_key(
				config.processing.firecrawl_map.api_key,
				this.name,
			);

			try {
				// Start the map operation
				const map_data =
					await make_firecrawl_request<FirecrawlMapResponse>(
						this.name,
						config.processing.firecrawl_map.base_url,
						api_key,
						{
							url: map_url,
							limit: extract_depth === 'advanced' ? 200 : 50,
							ignoreSitemap: false,
							includeSubdomains: false,
						},
						config.processing.firecrawl_map.timeout,
					);

				validate_firecrawl_response(
					map_data,
					this.name,
					'Error mapping website',
				);

				// Check if we have links
				if (!map_data.links || map_data.links.length === 0) {
					throw new ProviderError(
						ErrorType.PROVIDER_ERROR,
						'No URLs discovered during mapping',
						this.name,
					);
				}

				// Format the links as a list with descriptions
				const formatted_content =
					`# Site Map for ${map_url}\n\n` +
					`Found ${map_data.links.length} URLs:\n\n` +
					map_data.links.map((url) => `- ${url}`).join('\n');

				// Create a single raw_content entry with all URLs
				const raw_contents = [
					{
						url: map_url,
						content: formatted_content,
					},
				];

				return {
					content: formatted_content,
					raw_contents,
					metadata: {
						title: `Site Map for ${map_url}`,
						word_count: map_data.links.length, // Count URLs as "words"
						urls_processed: 1, // We only processed the starting URL
						successful_extractions: 1,
						extract_depth,
					},
					source_provider: this.name,
				};
			} catch (error) {
				handle_provider_error(error, this.name, 'map website');
			}
		};

		return retry_with_backoff(map_request);
	}
}
