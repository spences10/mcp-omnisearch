import {
	ErrorHandler,
	create_error_handler,
} from './error-handler.js';
import { HttpClient, create_http_client } from './http-client.js';
import {
	BaseSearchParams,
	SearchProvider,
	SearchResult,
} from './types.js';
import {
	apply_search_operators,
	parse_search_operators,
	retry_with_backoff,
	sanitize_query,
} from './utils.js';
import { ValidationUtils } from './validation.js';

export interface SearchProviderConfig {
	api_key: string;
	base_url: string;
	timeout?: number;
	max_retries?: number;
	auth_type?: 'bearer' | 'api-key' | 'custom';
	custom_headers?: Record<string, string>;
}

export abstract class AbstractSearchProvider
	implements SearchProvider
{
	abstract readonly name: string;
	abstract readonly description: string;

	protected http_client: HttpClient;
	protected error_handler: ErrorHandler;
	protected config: SearchProviderConfig;

	constructor(config: SearchProviderConfig, provider_name: string) {
		this.config = config;
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

	protected validate_search_params(params: BaseSearchParams): void {
		ValidationUtils.validate_query(params.query);
		ValidationUtils.validate_limit(params.limit);
		ValidationUtils.validate_string_array(
			params.include_domains,
			'include_domains',
			{ max_items: 10, max_item_length: 100 },
		);
		ValidationUtils.validate_string_array(
			params.exclude_domains,
			'exclude_domains',
			{ max_items: 10, max_item_length: 100 },
		);
	}

	protected parse_query_operators(query: string) {
		const parsed_query = parse_search_operators(query);
		const search_params = apply_search_operators(parsed_query);
		return {
			base_query: sanitize_query(search_params.query),
			search_params,
			parsed_query,
		};
	}

	protected build_domain_filters(
		params: BaseSearchParams,
		search_params: any,
		format: 'query' | 'array' = 'query',
	):
		| { include_filter: string; exclude_filter: string }
		| { include_domains: string[]; exclude_domains: string[] } {
		const include_domains = [
			...(params.include_domains ?? []),
			...(search_params.include_domains ?? []),
		];
		const exclude_domains = [
			...(params.exclude_domains ?? []),
			...(search_params.exclude_domains ?? []),
		];

		if (format === 'array') {
			return { include_domains, exclude_domains };
		}

		const include_filter = include_domains.length
			? include_domains.map((domain) => `site:${domain}`).join(' OR ')
			: '';

		const exclude_filter = exclude_domains.length
			? exclude_domains.map((domain) => `-site:${domain}`).join(' ')
			: '';

		return { include_filter, exclude_filter };
	}

	protected format_search_result(
		result: any,
		mapping: {
			title?: string;
			url?: string;
			snippet?: string;
			score?: string;
		} = {},
	): SearchResult {
		return {
			title: result[mapping.title || 'title'] || 'No title',
			url: result[mapping.url || 'url'] || '',
			snippet:
				result[mapping.snippet || 'snippet'] ||
				'No description available',
			score: result[mapping.score || 'score'] || 0,
			source_provider: this.name,
			metadata: this.extract_metadata(result),
		};
	}

	protected extract_metadata(result: any): Record<string, any> {
		// Base implementation - can be overridden by subclasses
		const metadata: Record<string, any> = {};

		// Common metadata fields
		const common_fields = [
			'id',
			'author',
			'publishedDate',
			'highlights',
			'summary',
			'domain',
			'language',
			'type',
		];

		for (const field of common_fields) {
			if (result[field] !== undefined) {
				metadata[field] = result[field];
			}
		}

		return metadata;
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

	// Abstract method that must be implemented by concrete providers
	abstract search(params: BaseSearchParams): Promise<SearchResult[]>;

	// Optional methods that can be overridden by providers with additional capabilities
	async search_repositories?(
		params: BaseSearchParams & { sort?: string },
	): Promise<SearchResult[]> {
		throw new Error(
			`Repository search not supported by ${this.name}`,
		);
	}

	async search_users?(
		params: BaseSearchParams,
	): Promise<SearchResult[]> {
		throw new Error(`User search not supported by ${this.name}`);
	}

	async search_code?(
		params: BaseSearchParams & { include_snippets?: boolean },
	): Promise<SearchResult[]> {
		throw new Error(`Code search not supported by ${this.name}`);
	}
}
