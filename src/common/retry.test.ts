import { afterEach, describe, expect, it, vi } from 'vitest';
import { is_retryable_error, retry_with_backoff } from './retry.js';
import { ErrorType, ProviderError } from './types.js';

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe('is_retryable_error', () => {
	it('retries rate limits, timeouts, network errors, and 5xx provider responses', () => {
		expect(
			is_retryable_error(
				new ProviderError(ErrorType.RATE_LIMIT, 'slow down', 'brave'),
			),
		).toBe(true);
		expect(
			is_retryable_error(
				new ProviderError(
					ErrorType.PROVIDER_ERROR,
					'bad gateway',
					'kagi',
					{ status: 502 },
				),
			),
		).toBe(true);
		expect(is_retryable_error(new TypeError('fetch failed'))).toBe(
			true,
		);
		expect(
			is_retryable_error(new DOMException('timeout', 'TimeoutError')),
		).toBe(true);
	});

	it('does not retry invalid input, invalid keys, ordinary 4xx, or provider validation failures', () => {
		expect(
			is_retryable_error(
				new ProviderError(
					ErrorType.INVALID_INPUT,
					'bad query',
					'github',
				),
			),
		).toBe(false);
		expect(
			is_retryable_error(
				new ProviderError(
					ErrorType.API_ERROR,
					'Invalid API key',
					'kagi',
				),
			),
		).toBe(false);
		expect(
			is_retryable_error(
				new ProviderError(
					ErrorType.API_ERROR,
					'bad request',
					'tavily',
					{ status: 400 },
				),
			),
		).toBe(false);
		expect(
			is_retryable_error(
				new ProviderError(
					ErrorType.PROVIDER_ERROR,
					'No content extracted',
					'firecrawl',
				),
			),
		).toBe(false);
	});
});

describe('retry_with_backoff', () => {
	it('returns immediately when the operation succeeds on the first try', async () => {
		const fn = vi.fn().mockResolvedValue('ok');

		await expect(retry_with_backoff(fn)).resolves.toBe('ok');
		expect(fn).toHaveBeenCalledTimes(1);
	});

	it('retries retryable errors with exponential backoff until the operation succeeds', async () => {
		vi.useFakeTimers();

		const fn = vi
			.fn<() => Promise<string>>()
			.mockRejectedValueOnce(new TypeError('first failure'))
			.mockRejectedValueOnce(
				new ProviderError(
					ErrorType.RATE_LIMIT,
					'second failure',
					'brave',
				),
			)
			.mockResolvedValueOnce('ok');

		const promise = retry_with_backoff(fn, {
			max_retries: 3,
			initial_delay: 100,
			jitter_ratio: 0,
		});

		expect(fn).toHaveBeenCalledTimes(1);

		await vi.advanceTimersByTimeAsync(100);
		expect(fn).toHaveBeenCalledTimes(2);

		await vi.advanceTimersByTimeAsync(200);
		expect(fn).toHaveBeenCalledTimes(3);

		await expect(promise).resolves.toBe('ok');
	});

	it('applies configurable jitter to retry delays', async () => {
		vi.useFakeTimers();

		const fn = vi
			.fn<() => Promise<string>>()
			.mockRejectedValueOnce(new TypeError('first failure'))
			.mockResolvedValueOnce('ok');

		const promise = retry_with_backoff(fn, {
			max_retries: 1,
			initial_delay: 100,
			jitter_ratio: 0.2,
			random: () => 1,
		});

		expect(fn).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(119);
		expect(fn).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(1);
		expect(fn).toHaveBeenCalledTimes(2);

		await expect(promise).resolves.toBe('ok');
	});

	it('does not retry non-retryable errors', async () => {
		const error = new ProviderError(
			ErrorType.INVALID_INPUT,
			'bad query',
			'web_search',
		);
		const fn = vi
			.fn<() => Promise<string>>()
			.mockRejectedValue(error);

		await expect(retry_with_backoff(fn)).rejects.toBe(error);
		expect(fn).toHaveBeenCalledTimes(1);
	});

	it('rethrows the final error after exhausting retries', async () => {
		vi.useFakeTimers();

		const error = new TypeError('still failing');
		const fn = vi
			.fn<() => Promise<string>>()
			.mockRejectedValue(error);
		const promise = retry_with_backoff(fn, {
			max_retries: 2,
			initial_delay: 50,
			jitter_ratio: 0,
		});
		const rejection = promise.catch((caught) => caught);

		expect(fn).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(50);
		expect(fn).toHaveBeenCalledTimes(2);
		await vi.advanceTimersByTimeAsync(100);
		expect(fn).toHaveBeenCalledTimes(3);

		await expect(rejection).resolves.toBe(error);
	});
});
