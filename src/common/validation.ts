import { ErrorType, ProviderError } from './types.js';

export interface ValidationResult {
	valid: boolean;
	errors: string[];
}

export interface UrlValidationOptions {
	allowed_protocols?: string[];
	allow_localhost?: boolean;
	require_https?: boolean;
	max_length?: number;
}

export interface ApiKeyValidationOptions {
	min_length?: number;
	max_length?: number;
	pattern?: RegExp;
	allow_empty?: boolean;
}

export class ValidationUtils {
	static validate_url(
		url: string,
		options: UrlValidationOptions = {},
	): ValidationResult {
		const errors: string[] = [];

		if (!url || typeof url !== 'string') {
			errors.push('URL must be a non-empty string');
			return { valid: false, errors };
		}

		if (options.max_length && url.length > options.max_length) {
			errors.push(
				`URL exceeds maximum length of ${options.max_length} characters`,
			);
		}

		try {
			const parsed_url = new URL(url);

			const allowed_protocols = options.allowed_protocols || [
				'http:',
				'https:',
			];
			if (!allowed_protocols.includes(parsed_url.protocol)) {
				errors.push(
					`Protocol ${
						parsed_url.protocol
					} is not allowed. Allowed protocols: ${allowed_protocols.join(
						', ',
					)}`,
				);
			}

			if (options.require_https && parsed_url.protocol !== 'https:') {
				errors.push('HTTPS is required');
			}

			if (
				!options.allow_localhost &&
				(parsed_url.hostname === 'localhost' ||
					parsed_url.hostname === '127.0.0.1' ||
					parsed_url.hostname.endsWith('.local'))
			) {
				errors.push('Localhost and local domains are not allowed');
			}
		} catch (error) {
			errors.push(
				`Invalid URL format: ${
					error instanceof Error ? error.message : 'Unknown error'
				}`,
			);
		}

		return {
			valid: errors.length === 0,
			errors,
		};
	}

	static validate_urls(
		urls: string | string[],
		options: UrlValidationOptions = {},
	): ValidationResult {
		const url_array = Array.isArray(urls) ? urls : [urls];
		const all_errors: string[] = [];

		if (url_array.length === 0) {
			return {
				valid: false,
				errors: ['At least one URL is required'],
			};
		}

		url_array.forEach((url, index) => {
			const result = this.validate_url(url, options);
			if (!result.valid) {
				const prefix =
					url_array.length > 1 ? `URL ${index + 1}: ` : '';
				all_errors.push(
					...result.errors.map((error) => prefix + error),
				);
			}
		});

		return {
			valid: all_errors.length === 0,
			errors: all_errors,
		};
	}

	static validate_api_key(
		api_key: string | undefined,
		provider_name: string,
		options: ApiKeyValidationOptions = {},
	): string {
		if (!api_key) {
			if (options.allow_empty) {
				return '';
			}
			throw new ProviderError(
				ErrorType.INVALID_INPUT,
				`API key not found for ${provider_name}`,
				provider_name,
			);
		}

		if (typeof api_key !== 'string') {
			throw new ProviderError(
				ErrorType.INVALID_INPUT,
				`API key must be a string for ${provider_name}`,
				provider_name,
			);
		}

		const trimmed_key = api_key.trim();

		if (!trimmed_key && !options.allow_empty) {
			throw new ProviderError(
				ErrorType.INVALID_INPUT,
				`API key cannot be empty for ${provider_name}`,
				provider_name,
			);
		}

		if (
			options.min_length &&
			trimmed_key.length < options.min_length
		) {
			throw new ProviderError(
				ErrorType.INVALID_INPUT,
				`API key for ${provider_name} must be at least ${options.min_length} characters long`,
				provider_name,
			);
		}

		if (
			options.max_length &&
			trimmed_key.length > options.max_length
		) {
			throw new ProviderError(
				ErrorType.INVALID_INPUT,
				`API key for ${provider_name} cannot exceed ${options.max_length} characters`,
				provider_name,
			);
		}

		if (options.pattern && !options.pattern.test(trimmed_key)) {
			throw new ProviderError(
				ErrorType.INVALID_INPUT,
				`API key format is invalid for ${provider_name}`,
				provider_name,
			);
		}

		return trimmed_key;
	}

	static validate_limit(
		limit?: number,
		max_limit: number = 50,
		min_limit: number = 1,
	): number | undefined {
		if (limit === undefined) {
			return undefined;
		}

		if (
			!Number.isInteger(limit) ||
			limit < min_limit ||
			limit > max_limit
		) {
			throw new ProviderError(
				ErrorType.INVALID_INPUT,
				`Limit must be an integer between ${min_limit} and ${max_limit}`,
				'validation',
			);
		}

		return limit;
	}

	static validate_string_array(
		value: string[] | undefined,
		field_name: string,
		options: {
			max_items?: number;
			min_items?: number;
			max_item_length?: number;
			allow_empty?: boolean;
		} = {},
	): string[] | undefined {
		if (value === undefined) {
			return undefined;
		}

		if (!Array.isArray(value)) {
			throw new ProviderError(
				ErrorType.INVALID_INPUT,
				`${field_name} must be an array of strings`,
				'validation',
			);
		}

		if (!options.allow_empty && value.length === 0) {
			return undefined;
		}

		if (options.min_items && value.length < options.min_items) {
			throw new ProviderError(
				ErrorType.INVALID_INPUT,
				`${field_name} must contain at least ${options.min_items} item(s)`,
				'validation',
			);
		}

		if (options.max_items && value.length > options.max_items) {
			throw new ProviderError(
				ErrorType.INVALID_INPUT,
				`${field_name} cannot contain more than ${options.max_items} item(s)`,
				'validation',
			);
		}

		for (let i = 0; i < value.length; i++) {
			const item = value[i];

			if (typeof item !== 'string') {
				throw new ProviderError(
					ErrorType.INVALID_INPUT,
					`${field_name} item at index ${i} must be a string`,
					'validation',
				);
			}

			if (
				options.max_item_length &&
				item.length > options.max_item_length
			) {
				throw new ProviderError(
					ErrorType.INVALID_INPUT,
					`${field_name} item at index ${i} exceeds maximum length of ${options.max_item_length} characters`,
					'validation',
				);
			}
		}

		return value;
	}

	static validate_enum<T extends string>(
		value: T | undefined,
		allowed_values: readonly T[],
		field_name: string,
		required: boolean = false,
	): T | undefined {
		if (value === undefined) {
			if (required) {
				throw new ProviderError(
					ErrorType.INVALID_INPUT,
					`${field_name} is required`,
					'validation',
				);
			}
			return undefined;
		}

		if (!allowed_values.includes(value)) {
			throw new ProviderError(
				ErrorType.INVALID_INPUT,
				`${field_name} must be one of: ${allowed_values.join(', ')}`,
				'validation',
			);
		}

		return value;
	}

	static sanitize_query(query: string): string {
		if (!query || typeof query !== 'string') {
			throw new ProviderError(
				ErrorType.INVALID_INPUT,
				'Query must be a non-empty string',
				'validation',
			);
		}

		return query.trim().replace(/[\n\r]+/g, ' ');
	}

	static validate_query(
		query: string,
		options: {
			min_length?: number;
			max_length?: number;
			allow_empty?: boolean;
		} = {},
	): string {
		if (!query || typeof query !== 'string') {
			throw new ProviderError(
				ErrorType.INVALID_INPUT,
				'Query must be a non-empty string',
				'validation',
			);
		}

		const sanitized = this.sanitize_query(query);

		if (!options.allow_empty && !sanitized) {
			throw new ProviderError(
				ErrorType.INVALID_INPUT,
				'Query cannot be empty',
				'validation',
			);
		}

		if (options.min_length && sanitized.length < options.min_length) {
			throw new ProviderError(
				ErrorType.INVALID_INPUT,
				`Query must be at least ${options.min_length} characters long`,
				'validation',
			);
		}

		if (options.max_length && sanitized.length > options.max_length) {
			throw new ProviderError(
				ErrorType.INVALID_INPUT,
				`Query cannot exceed ${options.max_length} characters`,
				'validation',
			);
		}

		return sanitized;
	}
}

// Legacy compatibility functions
export const validate_api_key = (
	key: string | undefined,
	provider: string,
): string => {
	return ValidationUtils.validate_api_key(key, provider);
};

export const is_valid_url = (url: string): boolean => {
	const result = ValidationUtils.validate_url(url);
	return result.valid;
};

export const sanitize_query = (query: string): string => {
	return ValidationUtils.sanitize_query(query);
};

// Convenience functions for common validations
export const validate_url_input = (
	urls: string | string[],
	provider_name: string,
	options: UrlValidationOptions = {},
): string[] => {
	const result = ValidationUtils.validate_urls(urls, options);

	if (!result.valid) {
		throw new ProviderError(
			ErrorType.INVALID_INPUT,
			result.errors.join('; '),
			provider_name,
		);
	}

	return Array.isArray(urls) ? urls : [urls];
};

export const validate_search_params = (params: {
	query: string;
	limit?: number;
	include_domains?: string[];
	exclude_domains?: string[];
}) => {
	const sanitized_query = ValidationUtils.validate_query(
		params.query,
	);
	const validated_limit = ValidationUtils.validate_limit(
		params.limit,
	);
	const validated_include_domains =
		ValidationUtils.validate_string_array(
			params.include_domains,
			'include_domains',
			{ max_items: 10, max_item_length: 100 },
		);
	const validated_exclude_domains =
		ValidationUtils.validate_string_array(
			params.exclude_domains,
			'exclude_domains',
			{ max_items: 10, max_item_length: 100 },
		);

	return {
		query: sanitized_query,
		limit: validated_limit,
		include_domains: validated_include_domains,
		exclude_domains: validated_exclude_domains,
	};
};
