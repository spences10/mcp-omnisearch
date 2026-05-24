import {
	ErrorType,
	ProviderError,
	type ProviderErrorDetails,
} from './types.js';

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
		{ reset_time, retryable: true },
	);
};

export const provider_error = (
	type: ErrorType,
	message: string,
	provider: string,
	details: ProviderErrorDetails = {},
) => new ProviderError(type, message, provider, details);

export const normalize_provider_http_error = (
	provider: string,
	status: number,
	message: string,
): ProviderError => {
	switch (status) {
		case 400:
		case 422:
			return provider_error(
				ErrorType.INVALID_INPUT,
				`Invalid request: ${message}`,
				provider,
				{ status, retryable: false },
			);
		case 401:
		case 403:
			return provider_error(
				ErrorType.AUTH_ERROR,
				status === 401
					? 'Invalid API key'
					: 'API key does not have access to this endpoint',
				provider,
				{ status, retryable: false },
			);
		case 408:
			return provider_error(
				ErrorType.TIMEOUT,
				`${provider} API request timed out`,
				provider,
				{ status, retryable: true },
			);
		case 429:
			return provider_error(
				ErrorType.RATE_LIMIT,
				`Rate limit exceeded for ${provider}`,
				provider,
				{ status, retryable: true },
			);
		default:
			if (status >= 500) {
				return provider_error(
					ErrorType.TRANSIENT_PROVIDER_ERROR,
					`${provider} API internal error`,
					provider,
					{ status, retryable: true },
				);
			}
			return provider_error(
				ErrorType.API_ERROR,
				`Unexpected error: ${message}`,
				provider,
				{ status, retryable: false },
			);
	}
};

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

export const sanitize_query = (query: string): string => {
	return query.trim().replace(/[\n\r]+/g, ' ');
};

export const create_error_response = (error: Error) => {
	if (error instanceof ProviderError) {
		return {
			error: error.message,
			type: error.type,
			provider: error.provider,
			retryable: error.details?.retryable ?? false,
		};
	}
	return {
		error: `Unexpected error: ${error.message}`,
		type: ErrorType.API_ERROR,
		retryable: false,
	};
};
