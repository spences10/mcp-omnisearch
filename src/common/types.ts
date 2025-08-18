// Common type definitions for the MCP Omnisearch server

export interface SearchResult {
	title: string;
	url: string;
	snippet: string;
	score?: number;
	source_provider: string;
}

export interface BaseSearchParams {
	query: string;
	limit?: number;
	include_domains?: string[];
	exclude_domains?: string[];
}

export interface ProcessingResult {
	content: string;
	raw_contents?: Array<{
		url: string;
		content: string;
	}>;
	metadata: {
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

export interface EnhancementResult {
	original_content: string;
	enhanced_content: string;
	enhancements: {
		type: string;
		description: string;
	}[];
	sources?: Array<{
		title: string;
		url: string;
	}>;
	source_provider: string;
}

// Provider interfaces
export interface SearchProvider {
	search(params: BaseSearchParams): Promise<SearchResult[]>;
	name: string;
	description: string;
}

export interface ProcessingProvider {
	process_content(
		url: string | string[],
		extract_depth?: 'basic' | 'advanced',
	): Promise<ProcessingResult>;
	name: string;
	description: string;
}

export interface EnhancementProvider {
	enhance_content(content: string): Promise<EnhancementResult>;
	name: string;
	description: string;
}

// Error types
export enum ErrorType {
	API_ERROR = 'API_ERROR',
	RATE_LIMIT = 'RATE_LIMIT',
	INVALID_INPUT = 'INVALID_INPUT',
	PROVIDER_ERROR = 'PROVIDER_ERROR',
	CREDIT_EXHAUSTED = 'CREDIT_EXHAUSTED',
	QUOTA_EXCEEDED = 'QUOTA_EXCEEDED',
	AUTHENTICATION_ERROR = 'AUTHENTICATION_ERROR',
}

export class ProviderError extends Error {
	constructor(
		public type: ErrorType,
		message: string,
		public provider: string,
		public details?: any,
	) {
		super(message);
		this.name = 'ProviderError';
	}
}
