import { afterEach, describe, expect, it, vi } from 'vitest';
import { run_with_provider_failover } from './provider-failover.js';
import { ProviderHealthTracker } from './provider-health.js';
import { ErrorType, ProviderError } from './types.js';

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

const rate_limit = (provider: string) =>
	new ProviderError(ErrorType.RATE_LIMIT, 'slow down', provider, {
		status: 429,
		retryable: true,
	});

describe('run_with_provider_failover', () => {
	it('retries a transient failure then returns that provider', async () => {
		vi.useFakeTimers();
		const first = vi
			.fn<() => Promise<string>>()
			.mockRejectedValueOnce(rate_limit('tavily'))
			.mockResolvedValueOnce('tavily-ok');

		const promise = run_with_provider_failover(
			[
				{ id: 'tavily', run: first },
				{ id: 'exa', run: vi.fn() },
			],
			{
				retry: {
					max_retries: 2,
					initial_delay: 50,
					jitter_ratio: 0,
				},
			},
		);

		await vi.advanceTimersByTimeAsync(50);
		await expect(promise).resolves.toEqual({
			value: 'tavily-ok',
			provider: 'tavily',
			skipped: [],
		});
		expect(first).toHaveBeenCalledTimes(2);
	});

	it('fails over after retries and records skip metadata', async () => {
		vi.useFakeTimers();
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const tavily = vi
			.fn<() => Promise<string>>()
			.mockRejectedValue(rate_limit('tavily'));
		const exa = vi
			.fn<() => Promise<string>>()
			.mockResolvedValue('exa-ok');

		const promise = run_with_provider_failover(
			[
				{ id: 'tavily', run: tavily },
				{ id: 'exa', run: exa },
			],
			{
				retry: {
					max_retries: 1,
					initial_delay: 25,
					jitter_ratio: 0,
				},
			},
		);

		await vi.advanceTimersByTimeAsync(25);
		await expect(promise).resolves.toEqual({
			value: 'exa-ok',
			provider: 'exa',
			skipped: [{ provider: 'tavily', reason: 'quota' }],
		});
		expect(tavily).toHaveBeenCalledTimes(2);
		expect(exa).toHaveBeenCalledTimes(1);
	});

	it('skips providers already in cooldown', async () => {
		const health = new ProviderHealthTracker({ now: () => 0 });
		health.record_failure('tavily', rate_limit('tavily'));
		const tavily = vi.fn<() => Promise<string>>();
		const exa = vi
			.fn<() => Promise<string>>()
			.mockResolvedValue('exa-ok');

		await expect(
			run_with_provider_failover(
				[
					{ id: 'tavily', run: tavily },
					{ id: 'exa', run: exa },
				],
				{ health, retry: { max_retries: 0 } },
			),
		).resolves.toEqual({
			value: 'exa-ok',
			provider: 'exa',
			skipped: [{ provider: 'tavily', reason: 'cooldown' }],
		});
		expect(tavily).not.toHaveBeenCalled();
	});

	it('does not invent results when every provider fails', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const health = new ProviderHealthTracker({ now: () => 0 });

		await expect(
			run_with_provider_failover(
				[
					{
						id: 'tavily',
						run: async () => {
							throw rate_limit('tavily');
						},
					},
					{
						id: 'exa',
						run: async () => {
							throw new ProviderError(
								ErrorType.TIMEOUT,
								'timed out',
								'exa',
							);
						},
					},
				],
				{
					health,
					tool_name: 'web_search',
					retry: { max_retries: 0 },
				},
			),
		).rejects.toMatchObject({
			name: 'ProviderError',
			provider: 'web_search',
			message: expect.stringContaining('No results invented'),
			details: {
				retryable: false,
				skipped_providers: [
					{ provider: 'tavily', reason: 'quota' },
					{ provider: 'exa', reason: 'timeout' },
				],
				cause: 'timed out',
			},
		});
		expect(health.is_cooling_down('tavily')).toBe(true);
		expect(health.is_cooling_down('exa')).toBe(true);
	});

	it('does not fail over invalid input errors', async () => {
		const error = new ProviderError(
			ErrorType.INVALID_INPUT,
			'bad query',
			'tavily',
		);
		const exa = vi.fn<() => Promise<string>>();

		await expect(
			run_with_provider_failover(
				[
					{
						id: 'tavily',
						run: async () => {
							throw error;
						},
					},
					{ id: 'exa', run: exa },
				],
				{ retry: { max_retries: 0 } },
			),
		).rejects.toBe(error);
		expect(exa).not.toHaveBeenCalled();
	});

	it('treats empty provider results as success', async () => {
		const exa = vi.fn<() => Promise<string[]>>();

		await expect(
			run_with_provider_failover(
				[
					{ id: 'tavily', run: async () => [] },
					{ id: 'exa', run: exa },
				],
				{ retry: { max_retries: 0 } },
			),
		).resolves.toEqual({
			value: [],
			provider: 'tavily',
			skipped: [],
		});
		expect(exa).not.toHaveBeenCalled();
	});
});
