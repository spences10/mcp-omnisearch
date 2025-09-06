import { ErrorType, ProviderError } from './types.js';

export interface ErrorHandlerOptions {
	include_provider_name?: boolean;
	default_error_type?: ErrorType;
}

export class ErrorHandler {
	constructor(private provider_name: string, private options: ErrorHandlerOptions = {}) {}

	handle_http_error(
		response: Response,
		data: any,
		custom_message?: string,
	): never {
		const error_message = custom_message || data.message || data.error || response.statusText;
		const provider_name = this.options.include_provider_name !== false ? this.provider_name : '';

		switch (response.status) {
			case 400:
				throw new ProviderError(
					ErrorType.INVALID_INPUT,
					`Bad request: ${error_message}`,
					provider_name,
				);
			case 401:
				throw new ProviderError(
					ErrorType.API_ERROR,
					'Invalid API key',
					provider_name,
				);
			case 403:
				throw new ProviderError(
					ErrorType.API_ERROR,
					'API key does not have access to this endpoint',
					provider_name,
				);
			case 404:
				throw new ProviderError(
					ErrorType.API_ERROR,
					'Resource not found',
					provider_name,
				);
			case 422:
				throw new ProviderError(
					ErrorType.INVALID_INPUT,
					`Validation error: ${error_message}`,
					provider_name,
				);
			case 429:
				this.handle_rate_limit(response);
			case 500:
			case 502:
			case 503:
			case 504:
				throw new ProviderError(
					ErrorType.PROVIDER_ERROR,
					`${provider_name} API internal error: ${error_message}`,
					provider_name,
				);
			default:
				throw new ProviderError(
					this.options.default_error_type || ErrorType.API_ERROR,
					`Unexpected error: ${error_message}`,
					provider_name,
				);
		}
	}

	handle_rate_limit(response?: Response): never {
		const reset_time = response?.headers.get('x-ratelimit-reset') || 
						 response?.headers.get('retry-after');
		let reset_date: Date | undefined;

		if (reset_time) {
			// Try parsing as Unix timestamp first, then as ISO string
			const timestamp = parseInt(reset_time, 10);
			if (!isNaN(timestamp)) {
				reset_date = new Date(timestamp * 1000);
			} else {
				reset_date = new Date(reset_time);
			}
		}

		throw new ProviderError(
			ErrorType.RATE_LIMIT,
			`Rate limit exceeded for ${this.provider_name}${
				reset_date ? `. Reset at ${reset_date.toISOString()}` : ''
			}`,
			this.provider_name,
			{ reset_time: reset_date },
		);
	}

	handle_network_error(error: Error, custom_message?: string): never {
		const message = custom_message || `Network error: ${error.message}`;
		throw new ProviderError(
			ErrorType.API_ERROR,
			message,
			this.provider_name,
		);
	}

	handle_timeout_error(timeout: number): never {
		throw new ProviderError(
			ErrorType.API_ERROR,
			`Request timeout after ${timeout}ms`,
			this.provider_name,
		);
	}

	handle_validation_error(message: string, details?: any): never {
		throw new ProviderError(
			ErrorType.INVALID_INPUT,
			message,
			this.provider_name,
			details,
		);
	}

	handle_provider_error(message: string, details?: any): never {
		throw new ProviderError(
			ErrorType.PROVIDER_ERROR,
			message,
			this.provider_name,
			details,
		);
	}

	handle_unknown_error(error: unknown, context?: string): never {
		if (error instanceof ProviderError) {
			throw error;
		}

		let message = 'Unknown error occurred';
		if (error instanceof Error) {
			message = error.message;
		} else if (typeof error === 'string') {
			message = error;
		}

		if (context) {
			message = `${context}: ${message}`;
		}

		throw new ProviderError(
			this.options.default_error_type || ErrorType.API_ERROR,
			message,
			this.provider_name,
		);
	}

	wrap_async<T>(
		fn: () => Promise<T>,
		context?: string,
	): Promise<T> {
		return fn().catch((error) => {
			this.handle_unknown_error(error, context);
		});
	}
}

export const create_error_handler = (
	provider_name: string,
	options?: ErrorHandlerOptions,
): ErrorHandler => {
	return new ErrorHandler(provider_name, options);
};

export const handle_http_status = (
	status: number,
	data: any,
	provider_name: string,
	custom_message?: string,
): void => {
	if (status >= 400) {
		const error_handler = new ErrorHandler(provider_name);
		const mock_response = { 
			status, 
			statusText: '', 
			headers: new Headers() 
		} as Response;
		error_handler.handle_http_error(mock_response, data, custom_message);
	}
};

export const create_error_response = (error: Error): { error: string } => {
	if (error instanceof ProviderError) {
		return {
			error: `${error.provider} error: ${error.message}`,
		};
	}
	return {
		error: `Unexpected error: ${error.message}`,
	};
};