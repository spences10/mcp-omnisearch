import { afterEach, describe, expect, it, vi } from 'vitest';
import { retry_with_backoff } from './retry.js';

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe('retry_with_backoff', () => {
	it('returns immediately when the operation succeeds on the first try', async () => {
		const fn = vi.fn().mockResolvedValue('ok');

		await expect(retry_with_backoff(fn)).resolves.toBe('ok');
		expect(fn).toHaveBeenCalledTimes(1);
	});

	it('retries with exponential backoff until the operation succeeds', async () => {
		vi.useFakeTimers();

		const fn = vi
			.fn<() => Promise<string>>()
			.mockRejectedValueOnce(new Error('first failure'))
			.mockRejectedValueOnce(new Error('second failure'))
			.mockResolvedValueOnce('ok');

		const promise = retry_with_backoff(fn, 3, 100);
		const resolution = expect(promise).resolves.toBe('ok');

		expect(fn).toHaveBeenCalledTimes(1);

		await vi.advanceTimersByTimeAsync(100);
		expect(fn).toHaveBeenCalledTimes(2);

		await vi.advanceTimersByTimeAsync(200);
		expect(fn).toHaveBeenCalledTimes(3);

		await resolution;
	});

	it('rethrows the final error after exhausting retries', async () => {
		vi.useFakeTimers();

		const error = new Error('still failing');
		const fn = vi
			.fn<() => Promise<string>>()
			.mockRejectedValue(error);
		const promise = retry_with_backoff(fn, 2, 50);
		const rejection = expect(promise).rejects.toBe(error);

		expect(fn).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(50);
		expect(fn).toHaveBeenCalledTimes(2);
		await vi.advanceTimersByTimeAsync(100);
		expect(fn).toHaveBeenCalledTimes(3);

		await rejection;
	});
});
