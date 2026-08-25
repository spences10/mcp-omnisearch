// Common type definitions for the MCP Omnisearch server

export type ProviderMetadata = Record<string, unknown>;

export interface SearchResult {
	title: string;
	url: string;
	snippet: string;
	score?: number;
	source_provider: string;
	metadata?: ProviderMetadata;
}

export type SearchDepth =
	| 'basic'
	| 'advanced'
	| 'fast'
	| 'ultra-fast';
export type SearchTopic = 'general' | 'news' | 'finance';
export type SearchTimeRange = 'day' | 'week' | 'month' | 'year';

export interface BaseSearchParams {
	query: string;
	limit?: number;
	include_domains?: string[];
	exclude_domains?: string[];
	search_depth?: SearchDepth;
	topic?: SearchTopic;
	time_range?: SearchTimeRange;
	safe_search?: boolean;
	include_raw_content?: boolean;
	auto_parameters?: boolean;
}

export interface ProcessingResult {
	content: string;
	raw_contents?: Array<{
		url: string;
		content: string;
	}>;
	metadata: ProviderMetadata & {
		title?: string;
		author?: string;
		date?: string;
		word_count?: number;
		failed_urls?: string[];
		urls_processed?: number;
		successful_extractions?: number;
		extract_depth?: 'basic' | 'advanced';
	};
	source_provider: string;
}

// Provider interfaces
export interface SearchProvider {
	search(params: BaseSearchParams): Promise<SearchResult[]>;
	name: string;
	description: string;
}

export interface ProcessingOptions {
	query?: string;
	chunks_per_source?: number;
	format?: 'markdown' | 'text';
}

export interface ProcessingProvider {
	process_content(
		url: string | string[],
		extract_depth?: 'basic' | 'advanced',
		options?: ProcessingOptions,
	): Promise<ProcessingResult>;
	name: string;
	description: string;
}

// Error types
export enum ErrorType {
	API_ERROR = 'API_ERROR',
	AUTH_ERROR = 'AUTH_ERROR',
	RATE_LIMIT = 'RATE_LIMIT',
	INVALID_INPUT = 'INVALID_INPUT',
	TIMEOUT = 'TIMEOUT',
	MALFORMED_RESPONSE = 'MALFORMED_RESPONSE',
	PROVIDER_ERROR = 'PROVIDER_ERROR',
	TRANSIENT_PROVIDER_ERROR = 'TRANSIENT_PROVIDER_ERROR',
}

export interface ProviderErrorDetails {
	status?: number;
	code?: string;
	reset_time?: Date;
	retryable?: boolean;
	cause?: string;
	[key: string]: unknown;
}

export class ProviderError extends Error {
	constructor(
		public type: ErrorType,
		message: string,
		public provider: string,
		public details?: ProviderErrorDetails,
	) {
		super(message);
		this.name = 'ProviderError';
	}
}
