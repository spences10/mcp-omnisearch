import {
	AbstractProcessingProvider,
	ProcessingOptions,
	ProcessingProviderConfig,
} from '../../../common/abstract-processing-provider.js';
import { ProcessingResult } from '../../../common/types.js';
import { config } from '../../../config/env.js';

interface TavilyExtractResponse {
	results: {
		url: string;
		raw_content: string;
		images?: {
			url: string;
			alt_text?: string;
		}[];
	}[];
	failed_results: string[];
	response_time: number;
}

export class TavilyExtractProvider extends AbstractProcessingProvider {
	readonly name = 'tavily_extract';
	readonly description =
		'Extract web page content from single or multiple URLs using Tavily Extract. Efficiently converts web content into clean, processable text with configurable extraction depth and optional image extraction. Returns both combined and individual URL content. Best for content analysis, data collection, and research.';

	constructor() {
		const provider_config: ProcessingProviderConfig = {
			api_key: config.processing.tavily_extract.api_key || '',
			base_url: config.processing.tavily_extract.base_url,
			timeout: config.processing.tavily_extract.timeout,
			auth_type: 'bearer',
		};

		const processing_options: ProcessingOptions = {
			max_urls: 10,
			allow_single_url: true,
			allow_multiple_urls: true,
			url_validation_options: {
				require_https: false,
				allow_localhost: false,
			},
		};

		super(provider_config, 'tavily_extract', processing_options);
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

		const extract_request = async (): Promise<ProcessingResult> => {
			try {
				const response =
					await this.http_client.post<TavilyExtractResponse>(
						'/extract',
						{
							urls: urls,
							include_images: false,
							extract_depth: validated_depth,
						},
						this.name,
					);

				const data = response.data;

				// Check if there are any results
				if (data.results.length === 0) {
					this.error_handler.handle_provider_error(
						'No content extracted from URL',
					);
				}

				// Map results to the expected format for aggregation
				const extracted_results = data.results.map((result) => ({
					url: result.url,
					content: result.raw_content,
				}));

				// Use base class aggregation
				const { combined_content, raw_contents, total_word_count } =
					this.aggregate_content(extracted_results, true);

				// Include any failed URLs in metadata
				const additional_metadata: Record<string, any> = {
					word_count: total_word_count,
					successful_extractions: data.results.length,
				};

				if (data.failed_results.length > 0) {
					additional_metadata.failed_urls = data.failed_results;
				}

				// Use base class metadata calculation
				const metadata = this.calculate_metadata(
					urls,
					validated_depth,
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
					'extract content',
				);
			}
		};

		return this.execute_with_retry(extract_request);
	}
}
