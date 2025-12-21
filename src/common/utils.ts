// Common utility functions for the MCP Omnisearch server

import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ErrorType, ProviderError } from './types.js';

// Token limit constants
const CHARS_PER_TOKEN = 4; // Rough estimate
const MAX_SAFE_TOKENS = 20000; // Buffer under Claude's 25k limit
const MAX_SAFE_CHARS = MAX_SAFE_TOKENS * CHARS_PER_TOKEN;

export interface Section {
	title: string;
	line: number;
}

export interface LargeResultResponse {
	file_path: string;
	total_lines: number;
	estimated_tokens: number;
	sections: Section[];
	read_hint: string;
	metadata?: Record<string, unknown>;
}

interface FormatResult {
	text: string;
	sections: Section[];
	total_lines: number;
}

/**
 * Format result as searchable plain text
 * Makes content grep-friendly with natural line breaks
 * Returns text content plus section index with line numbers
 */
const format_as_text = (
	result: Record<string, unknown>,
): FormatResult => {
	const lines: string[] = [];
	const sections: Section[] = [];
	let current_line = 1;

	const add_line = (line: string) => {
		// Check for section headers
		if (line.startsWith('URL: ')) {
			sections.push({ title: line, line: current_line });
		} else if (line.startsWith('# ')) {
			sections.push({ title: line.slice(2), line: current_line });
		} else if (line.startsWith('## ')) {
			sections.push({ title: line.slice(3), line: current_line });
		} else if (line.startsWith('### ')) {
			sections.push({ title: line.slice(4), line: current_line });
		}
		lines.push(line);
		current_line++;
	};

	const add_content = (content: string) => {
		const content_lines = content.split('\n');
		for (const line of content_lines) {
			add_line(line);
		}
	};

	const raw_contents = result.raw_contents as
		| Array<{ url: string; content: string }>
		| undefined;

	if (raw_contents?.length) {
		// Multi-URL result with raw_contents
		for (const item of raw_contents) {
			add_line('='.repeat(80));
			add_line(`URL: ${item.url}`);
			add_line('='.repeat(80));
			if (item.content) {
				add_content(item.content);
			}
			add_line('');
		}
	} else if (result.content) {
		// Single content field
		add_content(String(result.content));
	} else {
		// Fallback to JSON for other structures
		add_content(JSON.stringify(result, null, 2));
	}

	// Add metadata at the end
	if (result.metadata) {
		add_line('');
		add_line('='.repeat(80));
		sections.push({ title: 'METADATA', line: current_line });
		add_line('METADATA');
		add_line('='.repeat(80));
		add_content(JSON.stringify(result.metadata, null, 2));
	}

	return {
		text: lines.join('\n'),
		sections,
		total_lines: current_line - 1,
	};
};

/**
 * Check if result exceeds token limit and handle accordingly
 * If too large, saves to temp file and returns reference with section index
 * Otherwise returns original result
 */
export const handle_large_result = <T>(
	result: T,
	provider_name: string,
): T | LargeResultResponse => {
	const json = JSON.stringify(result, null, 2);
	const char_count = json.length;

	if (char_count <= MAX_SAFE_CHARS) {
		return result;
	}

	// Format and save as searchable plain text
	const file_id = randomUUID();
	const file_path = join(
		tmpdir(),
		`mcp-${provider_name}-${file_id}.txt`,
	);
	const { text, sections, total_lines } = format_as_text(
		result as Record<string, unknown>,
	);
	writeFileSync(file_path, text, 'utf-8');

	// Extract summary info from result
	const result_obj = result as Record<string, unknown>;
	const metadata = result_obj.metadata as
		| Record<string, unknown>
		| undefined;
	const word_count = metadata?.word_count ?? 'unknown';
	const urls_processed = metadata?.urls_processed ?? 'unknown';

	return {
		file_path,
		total_lines,
		estimated_tokens: Math.round(char_count / CHARS_PER_TOKEN),
		sections,
		read_hint: `Use Read tool with file_path="${file_path}" and offset=LINE_NUMBER limit=50 to read a section`,
		metadata: {
			word_count,
			urls_processed,
			source_provider: result_obj.source_provider,
		},
	};
};

const normalize_api_key = (raw: string): string => {
	// Trim whitespace and strip a single pair of wrapping quotes if present
	const trimmed = raw.trim();
	return trimmed.replace(/^(['"])(.*)\1$/, '$2');
};

export const validate_api_key = (
	key: string | undefined,
	provider: string,
): string => {
	if (!key) {
		throw new ProviderError(
			ErrorType.INVALID_INPUT,
			`API key not found for ${provider}`,
			provider,
		);
	}
	return normalize_api_key(key);
};

/**
 * Checks if an API key exists and is potentially valid without throwing an error
 * @param key The API key to check
 * @param provider The name of the provider (for logging purposes)
 * @returns boolean indicating if the key exists and is not empty
 */
export const is_api_key_valid = (
	key: string | undefined,
	provider: string,
): boolean => {
	if (!key || key.trim() === '') {
		console.warn(`API key not found or empty for ${provider}`);
		return false;
	}
	return true;
};

export const handle_rate_limit = (
	provider: string,
	reset_time?: Date,
): never => {
	throw new ProviderError(
		ErrorType.RATE_LIMIT,
		`Rate limit exceeded for ${provider}${
			reset_time ? `. Reset at ${reset_time.toISOString()}` : ''
		}`,
		provider,
		{ reset_time },
	);
};

/**
 * Standardized error handler for provider operations
 * @param error The error that occurred
 * @param provider_name The name of the provider
 * @param operation The operation being performed (default: 'operation')
 * @returns never - this function always throws
 * @throws ProviderError
 */
export function handle_provider_error(
	error: unknown,
	provider_name: string,
	operation: string = 'operation',
): never {
	if (error instanceof ProviderError) {
		throw error;
	}
	throw new ProviderError(
		ErrorType.API_ERROR,
		`Failed to ${operation}: ${
			error instanceof Error ? error.message : 'Unknown error'
		}`,
		provider_name,
	);
}

/**
 * Execute a provider operation with automatic retry logic and standardized error handling
 * @param provider_name The name of the provider
 * @param api_key_config The API key configuration
 * @param operation The async operation to execute
 * @param operation_name Description of the operation for error messages
 * @returns Promise with the operation result
 */
export const execute_with_retry = async <T>(
	provider_name: string,
	api_key_config: string | undefined,
	operation: (api_key: string) => Promise<T>,
	operation_name: string = 'fetch data',
): Promise<T> => {
	const request = async () => {
		const api_key = validate_api_key(api_key_config, provider_name);
		try {
			return await operation(api_key);
		} catch (error) {
			throw handle_provider_error(
				error,
				provider_name,
				operation_name,
			);
		}
	};
	return retry_with_backoff(request);
};

export const sanitize_query = (query: string): string => {
	return query.trim().replace(/[\n\r]+/g, ' ');
};

export const create_error_response = (
	error: Error,
): { error: string } => {
	if (error instanceof ProviderError) {
		return {
			error: `${error.provider} error: ${error.message}`,
		};
	}
	return {
		error: `Unexpected error: ${error.message}`,
	};
};

export const merge_search_results = <T extends { score?: number }>(
	results: T[],
	limit?: number,
): T[] => {
	const sorted = [...results].sort((a, b) => {
		const score_a = a.score ?? 0;
		const score_b = b.score ?? 0;
		return score_b - score_a;
	});

	return limit ? sorted.slice(0, limit) : sorted;
};

export const extract_domain = (url: string): string => {
	try {
		const domain = new URL(url).hostname;
		return domain.startsWith('www.') ? domain.slice(4) : domain;
	} catch {
		return '';
	}
};

export const is_valid_url = (url: string): boolean => {
	try {
		new URL(url);
		return true;
	} catch {
		return false;
	}
};

/**
 * Validate URLs for processing providers
 * Throws ProviderError if any URL is invalid
 * @param url Single URL or array of URLs to validate
 * @param provider_name Name of the provider for error messages
 * @returns Array of validated URLs
 */
export const validate_processing_urls = (
	url: string | string[],
	provider_name: string,
): string[] => {
	const urls = Array.isArray(url) ? url : [url];

	for (const u of urls) {
		if (!is_valid_url(u)) {
			throw new ProviderError(
				ErrorType.INVALID_INPUT,
				`Invalid URL provided: ${u}`,
				provider_name,
			);
		}
	}

	return urls;
};

export const delay = (ms: number): Promise<void> => {
	return new Promise((resolve) => setTimeout(resolve, ms));
};

export const retry_with_backoff = async <T>(
	fn: () => Promise<T>,
	max_retries: number = 3,
	initial_delay: number = 1000,
): Promise<T> => {
	let retries = 0;
	while (true) {
		try {
			return await fn();
		} catch (error) {
			if (retries >= max_retries) {
				throw error;
			}
			const delay_time = initial_delay * Math.pow(2, retries);
			await delay(delay_time);
			retries++;
		}
	}
};

export interface SearchOperator {
	type:
		| 'site'
		| 'exclude_site'
		| 'filetype'
		| 'ext'
		| 'intitle'
		| 'inurl'
		| 'inbody'
		| 'inpage'
		| 'language'
		| 'location'
		| 'before'
		| 'after'
		| 'exact'
		| 'force_include'
		| 'exclude_term'
		| 'boolean';
	value: string;
	original_text: string;
}

export interface ParsedQuery {
	base_query: string;
	operators: SearchOperator[];
}

const operator_patterns = {
	site: /site:([^\s]+)/g,
	exclude_site: /-site:([^\s]+)/g,
	filetype: /filetype:([^\s]+)/g,
	ext: /ext:([^\s]+)/g,
	intitle: /intitle:([^\s]+)/g,
	inurl: /inurl:([^\s]+)/g,
	inbody: /inbody:"?([^"\s]+)"?/g,
	inpage: /inpage:"?([^"\s]+)"?/g,
	language: /(?:lang|language):([^\s]+)/g,
	location: /(?:loc|location):([^\s]+)/g,
	before: /before:(\d{4}(?:-\d{2}(?:-\d{2})?)?)/g,
	after: /after:(\d{4}(?:-\d{2}(?:-\d{2})?)?)/g,
	exact: /"([^"]+)"/g,
	force_include: /\+([^\s]+)/g,
	exclude_term: /-([^\s:]+)(?!\s*site:)/g,
	boolean: /\b(AND|OR|NOT)\b/g,
};

export const parse_search_operators = (
	query: string,
): ParsedQuery => {
	const operators: SearchOperator[] = [];
	let modified_query = query;

	// Extract operators
	Object.entries(operator_patterns).forEach(([type, pattern]) => {
		modified_query = modified_query.replace(
			pattern,
			(match, value) => {
				operators.push({
					type: type as SearchOperator['type'],
					value: value,
					original_text: match,
				});
				return '';
			},
		);
	});

	// Clean up the base query
	const base_query = modified_query.replace(/\s+/g, ' ').trim();

	return {
		base_query,
		operators,
	};
};

export interface SearchParams {
	query: string;
	include_domains?: string[];
	exclude_domains?: string[];
	file_type?: string;
	title_filter?: string;
	url_filter?: string;
	body_filter?: string;
	page_filter?: string;
	language?: string;
	location?: string;
	date_before?: string;
	date_after?: string;
	exact_phrases?: string[];
	force_include_terms?: string[];
	exclude_terms?: string[];
	boolean_operators?: {
		type: 'AND' | 'OR' | 'NOT';
		terms: string[];
	}[];
}

export const apply_search_operators = (
	parsed_query: ParsedQuery,
): SearchParams => {
	const params: SearchParams = {
		query: parsed_query.base_query,
	};

	for (const operator of parsed_query.operators) {
		switch (operator.type) {
			case 'site':
				params.include_domains = [
					...(params.include_domains || []),
					operator.value,
				];
				break;
			case 'exclude_site':
				params.exclude_domains = [
					...(params.exclude_domains || []),
					operator.value,
				];
				break;
			case 'filetype':
			case 'ext':
				params.file_type = operator.value;
				break;
			case 'intitle':
				params.title_filter = operator.value;
				break;
			case 'inurl':
				params.url_filter = operator.value;
				break;
			case 'inbody':
				params.body_filter = operator.value;
				break;
			case 'inpage':
				params.page_filter = operator.value;
				break;
			case 'language':
				params.language = operator.value;
				break;
			case 'location':
				params.location = operator.value;
				break;
			case 'before':
				params.date_before = operator.value;
				break;
			case 'after':
				params.date_after = operator.value;
				break;
			case 'exact':
				params.exact_phrases = [
					...(params.exact_phrases || []),
					operator.value,
				];
				break;
			case 'force_include':
				params.force_include_terms = [
					...(params.force_include_terms || []),
					operator.value,
				];
				break;
			case 'exclude_term':
				params.exclude_terms = [
					...(params.exclude_terms || []),
					operator.value,
				];
				break;
			case 'boolean':
				// Handle boolean operators in the query string
				if (!params.boolean_operators) {
					params.boolean_operators = [];
				}
				params.boolean_operators.push({
					type: operator.value as 'AND' | 'OR' | 'NOT',
					terms: [],
				});
				break;
		}
	}

	return params;
};

export interface QueryBuildOptions {
	exclude_file_type?: boolean;
	exclude_dates?: boolean;
}

/**
 * Build a complete query string with all search operators for query-based providers
 * Used by Brave and Kagi which reconstruct operators in the query string
 */
export const build_query_with_operators = (
	search_params: SearchParams,
	additional_include_domains?: string[],
	additional_exclude_domains?: string[],
	options?: QueryBuildOptions,
): string => {
	let query = search_params.query;
	const filters: string[] = [];

	// Handle domain filters
	const include_domains = [
		...(additional_include_domains ?? []),
		...(search_params.include_domains ?? []),
	];
	if (include_domains.length) {
		const domain_filter = include_domains
			.map((domain) => `site:${domain}`)
			.join(' OR ');
		filters.push(domain_filter);
	}

	const exclude_domains = [
		...(additional_exclude_domains ?? []),
		...(search_params.exclude_domains ?? []),
	];
	if (exclude_domains.length) {
		filters.push(
			...exclude_domains.map((domain) => `-site:${domain}`),
		);
	}

	// Add file type filter
	if (search_params.file_type && !options?.exclude_file_type) {
		filters.push(`filetype:${search_params.file_type}`);
	}

	// Add title filter
	if (search_params.title_filter) {
		filters.push(`intitle:${search_params.title_filter}`);
	}

	// Add URL filter
	if (search_params.url_filter) {
		filters.push(`inurl:${search_params.url_filter}`);
	}

	// Add body filter
	if (search_params.body_filter) {
		filters.push(`inbody:${search_params.body_filter}`);
	}

	// Add page filter
	if (search_params.page_filter) {
		filters.push(`inpage:${search_params.page_filter}`);
	}

	// Add language filter
	if (search_params.language) {
		filters.push(`lang:${search_params.language}`);
	}

	// Add location filter
	if (search_params.location) {
		filters.push(`loc:${search_params.location}`);
	}

	// Add date filters
	if (search_params.date_before && !options?.exclude_dates) {
		filters.push(`before:${search_params.date_before}`);
	}
	if (search_params.date_after && !options?.exclude_dates) {
		filters.push(`after:${search_params.date_after}`);
	}

	// Add exact phrases
	if (search_params.exact_phrases?.length) {
		filters.push(
			...search_params.exact_phrases.map((phrase) => `"${phrase}"`),
		);
	}

	// Add force include terms
	if (search_params.force_include_terms?.length) {
		filters.push(
			...search_params.force_include_terms.map((term) => `+${term}`),
		);
	}

	// Add exclude terms
	if (search_params.exclude_terms?.length) {
		filters.push(
			...search_params.exclude_terms.map((term) => `-${term}`),
		);
	}

	// Combine query with filters
	if (filters.length > 0) {
		query = `${query} ${filters.join(' ')}`;
	}

	return query;
};

/**
 * Interface for processed URL results from processing providers
 */
export interface ProcessedUrlResult {
	url: string;
	content: string;
	metadata?: any;
	success: boolean;
	error?: string;
}

/**
 * Aggregate results from multiple URL processing attempts
 * Returns combined content and metadata, throws if all URLs failed
 * @param results Array of processed URL results
 * @param provider_name Name of the provider for error messages
 * @param urls Original URLs that were processed
 * @param extract_depth Extraction depth level
 * @returns Processing result with combined content and metadata
 */
export const aggregate_url_results = (
	results: ProcessedUrlResult[],
	provider_name: string,
	urls: string[],
	extract_depth: 'basic' | 'advanced',
) => {
	// Filter successful and failed results
	const successful_results = results.filter((r) => r.success);
	const failed_urls = results
		.filter((r) => !r.success)
		.map((r) => r.url);

	// If all URLs failed, throw an error
	if (successful_results.length === 0) {
		throw new ProviderError(
			ErrorType.PROVIDER_ERROR,
			'Failed to extract content from all URLs',
			provider_name,
		);
	}

	// Map results to raw_contents array
	const raw_contents = successful_results.map((result) => ({
		url: result.url,
		content: result.content,
	}));

	// Combine all results into a single content string
	const combined_content = raw_contents
		.map((result) => result.content)
		.join('\n\n');

	// Calculate total word count
	const word_count = combined_content
		.split(/\s+/)
		.filter(Boolean).length;

	// Get title from first successful result if available
	const title = successful_results[0]?.metadata?.title;

	return {
		content: combined_content,
		raw_contents,
		metadata: {
			title,
			word_count,
			failed_urls: failed_urls.length > 0 ? failed_urls : undefined,
			urls_processed: urls.length,
			successful_extractions: successful_results.length,
			extract_depth,
		},
		source_provider: provider_name,
	};
};

/**
 * Format AI response with answer and sources
 * Standardizes the response structure for AI providers
 * @param provider_name Name of the provider
 * @param provider_url URL of the provider
 * @param answer Main answer text
 * @param sources Optional array of sources
 * @param limit Optional limit on number of results
 * @returns Array of SearchResult objects
 */
export const format_ai_response = (
	provider_name: string,
	provider_url: string,
	answer: string,
	sources?: Array<{ title: string; url: string; content: string }>,
	limit?: number,
) => {
	const results = [
		{
			title: `${provider_name} Response`,
			url: provider_url,
			snippet: answer,
			source_provider: provider_name,
		},
	];

	if (sources?.length) {
		results.push(
			...sources.map((source) => ({
				title: source.title,
				url: source.url,
				snippet: source.content,
				source_provider: provider_name,
			})),
		);
	}

	return results
		.filter((r) => r.title && r.url && r.snippet)
		.slice(0, limit || results.length);
};

/**
 * Create standard Bearer token authorization headers
 * @param api_key The API key for authorization
 * @returns Headers object with Bearer authorization
 */
export const create_bearer_headers = (api_key: string) => ({
	Authorization: `Bearer ${api_key}`,
	'Content-Type': 'application/json',
});

/**
 * Create Bot token authorization headers (used by Kagi)
 * @param api_key The API key for authorization
 * @returns Headers object with Bot authorization
 */
export const create_bot_headers = (api_key: string) => ({
	Authorization: `Bot ${api_key}`,
	'Content-Type': 'application/json',
});
