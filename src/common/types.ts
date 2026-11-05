export enum ErrorType {
	API_ERROR = 'API_ERROR',
	AUTH_ERROR = 'AUTH_ERROR',
	RATE_LIMIT = 'RATE_LIMIT',
	INVALID_INPUT = 'INVALID_INPUT',
	TIMEOUT = 'TIMEOUT',
	TRANSIENT_PROVIDER_ERROR = 'TRANSIENT_PROVIDER_ERROR',
}

export interface ProviderErrorDetails {
	status: number;
	retryable: boolean;
}

export class ProviderError extends Error {
	constructor(
		public type: ErrorType,
		message: string,
		public provider: string,
		public details: ProviderErrorDetails,
	) {
		super(message);
		this.name = 'ProviderError';
	}
}
