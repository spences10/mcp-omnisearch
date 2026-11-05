import { describe, expect, it } from 'vitest';
import { normalize_provider_http_error } from './errors.js';
import { ErrorType, ProviderError } from './types.js';

describe('provider HTTP errors', () => {
	it.each([
		[400, ErrorType.INVALID_INPUT, false, 'Invalid request: detail'],
		[422, ErrorType.INVALID_INPUT, false, 'Invalid request: detail'],
		[401, ErrorType.AUTH_ERROR, false, 'Invalid API key'],
		[
			403,
			ErrorType.AUTH_ERROR,
			false,
			'API key does not have access to this endpoint',
		],
		[408, ErrorType.TIMEOUT, true, 'tavily API request timed out'],
		[
			429,
			ErrorType.RATE_LIMIT,
			true,
			'Rate limit exceeded for tavily',
		],
		[
			503,
			ErrorType.TRANSIENT_PROVIDER_ERROR,
			true,
			'tavily API internal error',
		],
		[404, ErrorType.API_ERROR, false, 'Unexpected error: detail'],
	] as const)(
		'normalizes HTTP %s without automatically retrying',
		(status, type, retryable, message) => {
			const error = normalize_provider_http_error(
				'tavily',
				status,
				'detail',
			);
			expect(error).toBeInstanceOf(ProviderError);
			expect(error).toMatchObject({
				name: 'ProviderError',
				provider: 'tavily',
				type,
				message,
				details: { status, retryable },
			});
		},
	);
});
