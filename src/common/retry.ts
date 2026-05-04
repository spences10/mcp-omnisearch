import { ErrorType, ProviderError } from './types.js';

export const delay = (ms: number): Promise<void> => {
	return new Promise((resolve) => setTimeout(resolve, ms));
};

export interface RetryOptions {
	max_retries?: number;
	initial_delay?: number;
	jitter_ratio?: number;
	random?: () => number;
	should_retry?: (error: unknown) => boolean;
}

const is_object_with_name = (
	error: unknown,
): error is { name: string } =>
	typeof error === 'object' &&
	error !== null &&
	'name' in error &&
	typeof error.name === 'string';

const get_status = (error: ProviderError): number | undefined => {
	const details = error.details;
	if (
		typeof details === 'object' &&
		details !== null &&
		'status' in details &&
		typeof details.status === 'number'
	) {
		return details.status;
	}
};

export const is_retryable_error = (error: unknown): boolean => {
	if (error instanceof ProviderError) {
		if (error.type === ErrorType.RATE_LIMIT) {
			return true;
		}

		const status = get_status(error);
		return (
			status !== undefined &&
			(status === 408 || status === 429 || status >= 500)
		);
	}

	if (is_object_with_name(error)) {
		return (
			error.name === 'AbortError' ||
			error.name === 'TimeoutError' ||
			error.name === 'TypeError'
		);
	}

	return false;
};

const normalize_retry_options = (
	max_retries_or_options: number | RetryOptions = {},
	initial_delay?: number,
): Required<RetryOptions> => {
	const options =
		typeof max_retries_or_options === 'number'
			? {
					max_retries: max_retries_or_options,
					initial_delay: initial_delay ?? 1000,
				}
			: max_retries_or_options;

	return {
		max_retries: options.max_retries ?? 3,
		initial_delay: options.initial_delay ?? 1000,
		jitter_ratio: options.jitter_ratio ?? 0.2,
		random: options.random ?? Math.random,
		should_retry: options.should_retry ?? is_retryable_error,
	};
};

const apply_jitter = (
	delay_time: number,
	jitter_ratio: number,
	random: () => number,
) => {
	if (jitter_ratio <= 0) return delay_time;
	const jitter = 1 + (random() * 2 - 1) * jitter_ratio;
	return Math.max(0, Math.round(delay_time * jitter));
};

export const retry_with_backoff = async <T>(
	fn: () => Promise<T>,
	max_retries_or_options?: number | RetryOptions,
	initial_delay?: number,
): Promise<T> => {
	const options = normalize_retry_options(
		max_retries_or_options,
		initial_delay,
	);
	let retries = 0;

	while (true) {
		try {
			return await fn();
		} catch (error) {
			if (
				retries >= options.max_retries ||
				!options.should_retry(error)
			) {
				throw error;
			}

			const base_delay = options.initial_delay * Math.pow(2, retries);
			const delay_time = apply_jitter(
				base_delay,
				options.jitter_ratio,
				options.random,
			);
			await delay(delay_time);
			retries++;
		}
	}
};
