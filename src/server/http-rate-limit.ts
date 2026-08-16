export type RateLimitDecision = {
	allowed: boolean;
	remaining: number;
	limit: number;
	retry_after_seconds: number;
};

export type SlidingWindowLimiter = {
	consume: (key: string) => RateLimitDecision;
};

export const create_sliding_window_limiter = (options: {
	max_requests: number;
	window_ms: number;
	now?: () => number;
}): SlidingWindowLimiter => {
	const windows = new Map<string, number[]>();
	const now = options.now ?? Date.now;

	return {
		consume(key: string): RateLimitDecision {
			const current = now();
			const cutoff = current - options.window_ms;
			const stamps = (windows.get(key) ?? []).filter(
				(stamp) => stamp > cutoff,
			);

			if (stamps.length >= options.max_requests) {
				windows.set(key, stamps);
				const retry_after_ms =
					stamps[0] + options.window_ms - current;
				return {
					allowed: false,
					remaining: 0,
					limit: options.max_requests,
					retry_after_seconds: Math.max(
						1,
						Math.ceil(retry_after_ms / 1000),
					),
				};
			}

			stamps.push(current);
			windows.set(key, stamps);
			return {
				allowed: true,
				remaining: options.max_requests - stamps.length,
				limit: options.max_requests,
				retry_after_seconds: 0,
			};
		},
	};
};
