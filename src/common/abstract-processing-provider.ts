import {
	ErrorHandler,
	create_error_handler,
} from './error-handler.js';
import { HttpClient, create_http_client } from './http-client.js';
import { ProcessingProvider, ProcessingResult } from './types.js';
import { retry_with_backoff } from './utils.js';
import { ValidationUtils } from './validation.js';

export interface ProcessingProviderConfig {
	api_key: string;
	base_url: string;
	timeout?: number;
	max_retries?: number;
	auth_type?: 'bearer' | 'api-key' | 'custom';
	custom_headers?: Record<string, string>;
}

export interface ProcessingOptions {
	extract_depth?: 'basic' | 'advanced';
	max_urls?: number;
	allow_single_url?: boolean;
	allow_multiple_urls?: boolean;
	url_validation_options?: {
		require_https?: boolean;
		allow_localhost?: boolean;
		max_length?: number;
	};
}

export abstract class AbstractProcessingProvider
	implements ProcessingProvider
{
	abstract readonly name: string;
	abstract readonly description: string;

	protected http_client: HttpClient;
	protected error_handler: ErrorHandler;
	protected config: ProcessingProviderConfig;
	protected processing_options: ProcessingOptions;

	constructor(
		config: ProcessingProviderConfig,
		provider_name: string,
		processing_options: ProcessingOptions = {},
	) {
		this.config = config;
		this.processing_options = {
			max_urls: 10,
			allow_single_url: true,
			allow_multiple_urls: true,
			...processing_options,
		};
		this.validate_config(provider_name);
		this.http_client = this.create_http_client();
		this.error_handler = create_error_handler(provider_name);
	}

	private validate_config(provider_name: string): void {
		ValidationUtils.validate_api_key(
			this.config.api_key,
			provider_name,
		);
		if (!this.config.base_url) {
			throw new Error(`Base URL is required for ${provider_name}`);
		}
	}

	private create_http_client(): HttpClient {
		let client = create_http_client({
			timeout: this.config.timeout || 30000,
			max_retries: this.config.max_retries || 3,
		});

		// Add authentication
		if (
			this.config.auth_type === 'bearer' ||
			!this.config.auth_type
		) {
			client = client.with_auth(this.config.api_key, 'bearer');
		} else if (this.config.auth_type === 'api-key') {
			client = client.with_auth(this.config.api_key, 'api-key');
		}

		// Add custom headers
		if (this.config.custom_headers) {
			client = client.with_headers(this.config.custom_headers);
		}

		return client;
	}

	protected validate_input(
		url: string | string[],
		extract_depth?: 'basic' | 'advanced',
	): { urls: string[]; validated_depth: 'basic' | 'advanced' } {
		// Validate extract_depth
		const validated_depth =
			ValidationUtils.validate_enum(
				extract_depth,
				['basic', 'advanced'] as const,
				'extract_depth',
			) || 'basic';

		// Convert to array and validate
		const url_array = Array.isArray(url) ? url : [url];

		// Check if provider supports the input type
		if (
			url_array.length === 1 &&
			!this.processing_options.allow_single_url
		) {
			this.error_handler.handle_validation_error(
				'This provider does not support single URL processing',
			);
		}

		if (
			url_array.length > 1 &&
			!this.processing_options.allow_multiple_urls
		) {
			this.error_handler.handle_validation_error(
				'This provider does not support multiple URL processing',
			);
		}

		// Validate URL count
		if (url_array.length === 0) {
			this.error_handler.handle_validation_error(
				'At least one URL must be provided',
			);
		}

		const max_urls = this.processing_options.max_urls || 10;
		if (url_array.length > max_urls) {
			this.error_handler.handle_validation_error(
				`Cannot process more than ${max_urls} URLs at once`,
			);
		}

		// Validate URL format
		const validation_options =
			this.processing_options.url_validation_options || {};
		for (let i = 0; i < url_array.length; i++) {
			const current_url = url_array[i];
			const result = ValidationUtils.validate_url(
				current_url,
				validation_options,
			);

			if (!result.valid) {
				const prefix = url_array.length > 1 ? `URL ${i + 1}: ` : '';
				this.error_handler.handle_validation_error(
					prefix + result.errors.join('; '),
				);
			}
		}

		return { urls: url_array, validated_depth };
	}

	protected calculate_metadata(
		urls: string[],
		extract_depth: 'basic' | 'advanced',
		additional_metadata?: Record<string, any>,
	): Record<string, any> {
		const base_metadata: Record<string, any> = {
			urls_processed: urls.length,
			extract_depth,
			successful_extractions: urls.length, // Override in implementations
			...(additional_metadata || {}),
		};

		// Add processing timestamps
		base_metadata.processed_at = new Date().toISOString();

		return base_metadata;
	}

	protected aggregate_content(
		results: Array<{ url: string; content: string; title?: string }>,
		include_separators: boolean = true,
	): {
		combined_content: string;
		raw_contents: Array<{ url: string; content: string }>;
		total_word_count: number;
	} {
		let combined_content = '';
		const raw_contents: Array<{ url: string; content: string }> = [];
		let total_word_count = 0;

		for (const result of results) {
			const content = result.content || 'No content available';
			const word_count = content.split(/\s+/).filter(Boolean).length;
			total_word_count += word_count;

			// Add to combined content with formatting
			if (result.title) {
				combined_content += `# ${result.title}\n\n`;
			}
			combined_content += `**URL:** ${result.url}\n`;
			combined_content += `**Word Count:** ${word_count}\n\n`;
			combined_content += content;

			if (include_separators && results.length > 1) {
				combined_content += '\n\n---\n\n';
			}

			// Add to raw contents
			raw_contents.push({
				url: result.url,
				content: content,
			});
		}

		return {
			combined_content,
			raw_contents,
			total_word_count,
		};
	}

	protected async execute_with_retry<T>(
		operation: () => Promise<T>,
		max_retries?: number,
	): Promise<T> {
		return retry_with_backoff(
			operation,
			max_retries || this.config.max_retries || 3,
		);
	}

	protected async poll_for_completion<T>(
		poll_function: () => Promise<{
			completed: boolean;
			data?: T;
			error?: string;
		}>,
		max_attempts: number = 20,
		poll_interval: number = 5000,
	): Promise<T> {
		let attempts = 0;

		while (attempts < max_attempts) {
			attempts++;

			try {
				const result = await poll_function();

				if (result.error) {
					this.error_handler.handle_provider_error(
						`Polling error: ${result.error}`,
					);
				}

				if (result.completed && result.data) {
					return result.data;
				}

				// Wait before next poll
				if (attempts < max_attempts) {
					await new Promise((resolve) =>
						setTimeout(resolve, poll_interval),
					);
				}
			} catch (error) {
				if (attempts >= max_attempts) {
					throw error;
				}
				// Continue polling on error unless max attempts reached
				await new Promise((resolve) =>
					setTimeout(resolve, poll_interval),
				);
			}
		}

		this.error_handler.handle_provider_error(
			`Operation timed out after ${max_attempts} attempts`,
		);
	}

	// Abstract method that must be implemented by concrete providers
	abstract process_content(
		url: string | string[],
		extract_depth?: 'basic' | 'advanced',
	): Promise<ProcessingResult>;
}
