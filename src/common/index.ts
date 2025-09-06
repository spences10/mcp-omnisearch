// Common utilities and base classes
export * from './types.js';

// Utils exports (main implementations)
export {
	apply_search_operators,
	create_error_response,
	delay,
	extract_domain,
	handle_rate_limit,
	is_api_key_valid,
	is_valid_url,
	merge_search_results,
	parse_search_operators,
	retry_with_backoff,
	sanitize_query,
	validate_api_key,
	type ParsedQuery,
	type SearchOperator,
	type SearchParams,
} from './utils.js';

// Validation exports (enhanced versions)
export {
	validate_search_params,
	validate_url_input,
	ValidationUtils,
	type ApiKeyValidationOptions,
	type UrlValidationOptions,
	type ValidationResult,
} from './validation.js';

// HTTP Client exports
export * from './http-client.js';

// Error Handler exports
export {
	create_error_handler,
	ErrorHandler,
	handle_http_status,
	type ErrorHandlerOptions,
} from './error-handler.js';

// Abstract base classes
export * from './abstract-processing-provider.js';
export * from './abstract-search-provider.js';
