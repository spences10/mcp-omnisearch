import { describe, expect, it } from 'vitest';
import { create_sliding_window_limiter } from './http-rate-limit.js';

describe('create_sliding_window_limiter', () => {
	it('allows requests until the window is full', () => {
		let now = 1_000;
		const limiter = create_sliding_window_limiter({
			max_requests: 2,
			window_ms: 60_000,
			now: () => now,
		});

		expect(limiter.consume('token-a').allowed).toBe(true);
		const second = limiter.consume('token-a');
		expect(second.allowed).toBe(true);
		expect(second.remaining).toBe(0);

		const blocked = limiter.consume('token-a');
		expect(blocked.allowed).toBe(false);
		expect(blocked.retry_after_seconds).toBeGreaterThan(0);
	});

	it('uses an independent sliding window per key', () => {
		const limiter = create_sliding_window_limiter({
			max_requests: 1,
			window_ms: 60_000,
			now: () => 1_000,
		});

		expect(limiter.consume('alpha').allowed).toBe(true);
		expect(limiter.consume('beta').allowed).toBe(true);
		expect(limiter.consume('alpha').allowed).toBe(false);
	});

	it('expires timestamps that fall outside the window', () => {
		let now = 10_000;
		const limiter = create_sliding_window_limiter({
			max_requests: 1,
			window_ms: 1_000,
			now: () => now,
		});

		expect(limiter.consume('token-a').allowed).toBe(true);
		now = 11_001;
		expect(limiter.consume('token-a').allowed).toBe(true);
	});
});
