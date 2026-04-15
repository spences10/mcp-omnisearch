import { describe, expect, it } from 'vitest';
import {
	create_error_response,
	handle_provider_error,
	handle_rate_limit,
	sanitize_query,
} from './errors.js';
import { ErrorType, ProviderError } from './types.js';

describe('handle_rate_limit', () => {
	it('throws a provider error with the reset time in details', () => {
		const reset_time = new Date('2026-04-15T12:00:00.000Z');

		expect(() => handle_rate_limit('brave', reset_time)).toThrowError(
			expect.objectContaining({
				type: ErrorType.RATE_LIMIT,
				provider: 'brave',
				details: { reset_time },
				message:
					'Rate limit exceeded for brave. Reset at 2026-04-15T12:00:00.000Z',
			}),
		);
	});
});

describe('handle_provider_error', () => {
	it('rethrows existing provider errors unchanged', () => {
		const error = new ProviderError(
			ErrorType.PROVIDER_ERROR,
			'already wrapped',
			'kagi',
		);

		expect(() =>
			handle_provider_error(error, 'kagi', 'fetch results'),
		).toThrow(error);
	});

	it('wraps generic errors with operation context', () => {
		expect(() =>
			handle_provider_error(
				new Error('boom'),
				'tavily',
				'fetch search results',
			),
		).toThrowError(
			expect.objectContaining({
				type: ErrorType.API_ERROR,
				provider: 'tavily',
				message: 'Failed to fetch search results: boom',
			}),
		);
	});
});

describe('sanitize_query', () => {
	it('trims whitespace and collapses newlines into spaces', () => {
		expect(sanitize_query('  hello\nworld\r\nagain  ')).toBe(
			'hello world again',
		);
	});
});

describe('create_error_response', () => {
	it('formats provider errors with the provider prefix', () => {
		const error = new ProviderError(
			ErrorType.API_ERROR,
			'Invalid API key',
			'exa',
		);

		expect(create_error_response(error)).toEqual({
			error: 'exa error: Invalid API key',
		});
	});

	it('formats generic errors as unexpected errors', () => {
		expect(create_error_response(new Error('unexpected'))).toEqual({
			error: 'Unexpected error: unexpected',
		});
	});
});
