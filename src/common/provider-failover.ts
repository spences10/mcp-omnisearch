import {
	ProviderHealthTracker,
	skip_reason_from_error,
	type ProviderSkipReason,
} from './provider-health.js';
import {
	is_retryable_error,
	retry_with_backoff,
	type RetryOptions,
} from './retry.js';
import { ErrorType, ProviderError } from './types.js';

export interface ProviderAttempt<T> {
	id: string;
	run: () => Promise<T>;
}

export interface SkippedProvider {
	provider: string;
	reason: ProviderSkipReason;
}

export interface FailoverSuccess<T> {
	value: T;
	provider: string;
	skipped: SkippedProvider[];
}

export interface AutoRouteResult<T> {
	results: T;
	metadata: {
		used_provider: string;
		skipped_providers: SkippedProvider[];
	};
}

export interface FailoverOptions {
	health?: ProviderHealthTracker;
	retry?: RetryOptions;
	tool_name?: string;
}

export const is_failover_eligible = (error: unknown): boolean => {
	if (
		error instanceof ProviderError &&
		error.type === ErrorType.INVALID_INPUT
	) {
		return false;
	}

	return (
		is_retryable_error(error) ||
		(error instanceof ProviderError &&
			error.type === ErrorType.AUTH_ERROR)
	);
};

export const to_auto_route_result = <T>(
	outcome: FailoverSuccess<T>,
): AutoRouteResult<T> => ({
	results: outcome.value,
	metadata: {
		used_provider: outcome.provider,
		skipped_providers: outcome.skipped,
	},
});

export const run_with_provider_failover = async <T>(
	attempts: readonly ProviderAttempt<T>[],
	options: FailoverOptions = {},
): Promise<FailoverSuccess<T>> => {
	const health = options.health ?? new ProviderHealthTracker();
	const tool_name = options.tool_name ?? 'search';
	const skipped: SkippedProvider[] = [];
	let last_error: unknown;

	if (attempts.length === 0) {
		throw new ProviderError(
			ErrorType.INVALID_INPUT,
			'No search providers are configured',
			tool_name,
		);
	}

	for (const attempt of attempts) {
		if (health.is_cooling_down(attempt.id)) {
			skipped.push({
				provider: attempt.id,
				reason: 'cooldown',
			});
			continue;
		}

		try {
			const value = await retry_with_backoff(
				attempt.run,
				options.retry,
			);
			health.record_success(attempt.id);
			return {
				value,
				provider: attempt.id,
				skipped,
			};
		} catch (error) {
			last_error = error;
			if (!is_failover_eligible(error)) {
				throw error;
			}

			const reason = skip_reason_from_error(error);
			health.record_failure(attempt.id, error);
			skipped.push({
				provider: attempt.id,
				reason,
			});
			console.error(
				`${tool_name}: ${attempt.id} failed (${reason}); trying next provider`,
			);
		}
	}

	const skipped_summary =
		skipped
			.map((entry) => `${entry.provider} (${entry.reason})`)
			.join(', ') || 'none';

	throw new ProviderError(
		last_error instanceof ProviderError
			? last_error.type
			: ErrorType.PROVIDER_ERROR,
		`All search providers failed. Skipped: ${skipped_summary}. No results invented.`,
		tool_name,
		{
			retryable: false,
			skipped_providers: skipped,
			cause:
				last_error instanceof Error ? last_error.message : undefined,
		},
	);
};
