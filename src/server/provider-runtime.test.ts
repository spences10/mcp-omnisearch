import { afterEach, describe, expect, it } from 'vitest';
import { ErrorType, ProviderError } from '../common/types.js';
import {
	clear_provider_runtime,
	get_provider_runtime,
	record_provider_error,
} from './provider-runtime.js';

afterEach(() => {
	clear_provider_runtime();
});

describe('provider runtime', () => {
	it('records last error type without storing the error message', () => {
		record_provider_error(
			new ProviderError(
				ErrorType.AUTH_ERROR,
				'Invalid API key sk-secret-value',
				'brave',
			),
		);

		const runtime = get_provider_runtime('brave');

		expect(runtime).toEqual({
			last_error_type: ErrorType.AUTH_ERROR,
			cooldown: false,
		});
		expect(JSON.stringify(runtime)).not.toContain('sk-secret-value');
		expect(JSON.stringify(runtime)).not.toContain('Invalid API key');
	});

	it('marks cooldown while a rate-limit reset time is in the future', () => {
		const now = new Date('2026-08-16T10:00:00.000Z');
		const reset_time = new Date('2026-08-16T10:05:00.000Z');

		record_provider_error(
			new ProviderError(
				ErrorType.RATE_LIMIT,
				'Rate limit exceeded for brave',
				'brave',
				{ reset_time, retryable: true },
			),
			() => now,
		);

		expect(get_provider_runtime('brave', () => now)).toEqual({
			last_error_type: ErrorType.RATE_LIMIT,
			cooldown: true,
		});
		expect(
			get_provider_runtime(
				'brave',
				() => new Date('2026-08-16T10:06:00.000Z'),
			),
		).toEqual({
			last_error_type: ErrorType.RATE_LIMIT,
			cooldown: false,
		});
	});

	it('uses a one-minute cooldown when rate-limited without reset_time', () => {
		const now = new Date('2026-08-16T10:00:00.000Z');

		record_provider_error(
			new ProviderError(
				ErrorType.RATE_LIMIT,
				'Rate limit exceeded for tavily',
				'tavily',
				{ retryable: true },
			),
			() => now,
		);

		expect(get_provider_runtime('tavily', () => now)).toEqual({
			last_error_type: ErrorType.RATE_LIMIT,
			cooldown: true,
		});
		expect(
			get_provider_runtime(
				'tavily',
				() => new Date('2026-08-16T10:01:00.000Z'),
			),
		).toEqual({
			last_error_type: ErrorType.RATE_LIMIT,
			cooldown: false,
		});
	});

	it('ignores non-provider errors', () => {
		record_provider_error(new Error('boom'));

		expect(get_provider_runtime('brave')).toEqual({
			last_error_type: null,
			cooldown: false,
		});
	});
});
