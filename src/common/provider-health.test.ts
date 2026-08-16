import { describe, expect, it } from 'vitest';
import {
	COOLDOWN_STEPS_MS,
	ProviderHealthTracker,
	decorate_status_with_health,
	skip_reason_from_error,
} from './provider-health.js';
import { ErrorType, ProviderError } from './types.js';

describe('skip_reason_from_error', () => {
	it('maps 429 and auth failures to quota', () => {
		expect(
			skip_reason_from_error(
				new ProviderError(
					ErrorType.RATE_LIMIT,
					'rate limited',
					'tavily',
					{ status: 429 },
				),
			),
		).toBe('quota');
		expect(
			skip_reason_from_error(
				new ProviderError(
					ErrorType.AUTH_ERROR,
					'suspended',
					'tavily',
					{ status: 403 },
				),
			),
		).toBe('quota');
	});

	it('maps timeouts to timeout and other outages to cooldown', () => {
		expect(
			skip_reason_from_error(
				new ProviderError(ErrorType.TIMEOUT, 'slow', 'brave'),
			),
		).toBe('timeout');
		expect(
			skip_reason_from_error(
				new DOMException('aborted', 'AbortError'),
			),
		).toBe('timeout');
		expect(
			skip_reason_from_error(
				new ProviderError(
					ErrorType.TRANSIENT_PROVIDER_ERROR,
					'unavailable',
					'exa',
					{ status: 503 },
				),
			),
		).toBe('cooldown');
	});
});

describe('ProviderHealthTracker', () => {
	it('applies stepped cooldowns and resets after success', () => {
		let now = 1_000_000;
		const health = new ProviderHealthTracker({
			now: () => now,
		});
		const error = new ProviderError(
			ErrorType.RATE_LIMIT,
			'429',
			'tavily',
			{ status: 429 },
		);

		health.record_failure('tavily', error);
		expect(health.is_cooling_down('tavily')).toBe(true);
		expect(health.get_skip_reason('tavily')).toBe('quota');
		expect(health.get_cooldown_until('tavily')).toBe(
			new Date(now + COOLDOWN_STEPS_MS[0]).toISOString(),
		);

		now += COOLDOWN_STEPS_MS[0];
		expect(health.is_cooling_down('tavily')).toBe(false);

		health.record_failure('tavily', error);
		expect(health.get_cooldown_until('tavily')).toBe(
			new Date(now + COOLDOWN_STEPS_MS[1]).toISOString(),
		);

		now += COOLDOWN_STEPS_MS[1];
		health.record_failure('tavily', error);
		expect(health.get_cooldown_until('tavily')).toBe(
			new Date(now + COOLDOWN_STEPS_MS[2]).toISOString(),
		);

		now += COOLDOWN_STEPS_MS[2];
		health.record_failure('tavily', error);
		expect(health.get_cooldown_until('tavily')).toBe(
			new Date(now + COOLDOWN_STEPS_MS[3]).toISOString(),
		);

		now += COOLDOWN_STEPS_MS[3];
		health.record_failure('tavily', error);
		expect(health.get_cooldown_until('tavily')).toBe(
			new Date(now + COOLDOWN_STEPS_MS[3]).toISOString(),
		);

		health.record_success('tavily');
		expect(health.is_cooling_down('tavily')).toBe(false);
		expect(health.get_skip_reason('tavily')).toBeUndefined();
	});

	it('decorates available provider status while cooling down', () => {
		const health = new ProviderHealthTracker({
			now: () => 0,
		});
		health.record_failure(
			'exa',
			new ProviderError(ErrorType.TIMEOUT, 'timeout', 'exa'),
		);

		expect(
			decorate_status_with_health(
				{
					id: 'exa',
					status: 'available',
				},
				health,
			),
		).toEqual({
			id: 'exa',
			status: 'available',
			skip_reason: 'cooldown',
			cooldown_until: new Date(COOLDOWN_STEPS_MS[0]).toISOString(),
		});
	});
});
