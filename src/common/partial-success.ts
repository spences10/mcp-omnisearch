import { ErrorType, ProviderError } from './types.js';

export interface ProviderFailure {
	provider: string;
	type: ErrorType;
}

export interface PartialSuccessMetadata {
	selected: string[];
	successful: string[];
	failed: ProviderFailure[];
	timed_out: string[];
	preempted?: string[];
}

export interface ProviderCall<T> {
	provider: string;
	run: () => Promise<T>;
}

export interface SettleProviderCallOptions {
	preempted?: readonly string[];
}

export interface PartialSuccess<T> {
	values: T[];
	metadata: PartialSuccessMetadata;
}

export interface PartialSuccessPayload<T> {
	results: T[];
	metadata: PartialSuccessMetadata;
}

/**
 * Normalize a single provider or list into unique ids, first-seen order.
 */
export const normalize_provider_selection = (
	provider: string | readonly string[],
): string[] =>
	typeof provider === 'string'
		? [provider]
		: unique_preserving_order(provider);

const unique_preserving_order = (values: readonly string[]) =>
	Array.from(new Set(values));

const is_timeout_like = (error: unknown): boolean => {
	if (typeof error !== 'object' || error === null) return false;
	if (!('name' in error) || typeof error.name !== 'string') {
		return false;
	}

	return error.name === 'TimeoutError' || error.name === 'AbortError';
};

/**
 * Map a thrown value to a public error type. Never returns messages,
 * stacks, or provider details that could contain secrets.
 */
export const classify_provider_failure = (
	error: unknown,
): ErrorType => {
	if (error instanceof ProviderError) {
		return error.type;
	}

	if (is_timeout_like(error)) {
		return ErrorType.TIMEOUT;
	}

	return ErrorType.API_ERROR;
};

/**
 * Build caller-safe provider outcome metadata. Failed entries keep
 * only the provider id and error type.
 */
export const build_partial_success_metadata = (input: {
	selected: readonly string[];
	successful: readonly string[];
	failed: readonly ProviderFailure[];
	timed_out: readonly string[];
	preempted?: readonly string[];
}): PartialSuccessMetadata => {
	const metadata: PartialSuccessMetadata = {
		selected: [...input.selected],
		successful: [...input.successful],
		failed: input.failed.map(({ provider, type }) => ({
			provider,
			type,
		})),
		timed_out: [...input.timed_out],
	};

	if (input.preempted && input.preempted.length > 0) {
		metadata.preempted = [...input.preempted];
	}

	return metadata;
};

/**
 * Run selected provider calls concurrently and keep whatever
 * succeeded. Timeouts are listed separately from other failures.
 */
export const settle_provider_calls = async <T>(
	calls: readonly ProviderCall<T>[],
	options: SettleProviderCallOptions = {},
): Promise<PartialSuccess<T>> => {
	const selected = unique_preserving_order(
		calls.map((call) => call.provider),
	);
	const unique_calls = selected.map(
		(provider) =>
			calls.find(
				(call) => call.provider === provider,
			) as ProviderCall<T>,
	);

	const settled = await Promise.allSettled(
		unique_calls.map((call) => call.run()),
	);

	const values: T[] = [];
	const successful: string[] = [];
	const failed: ProviderFailure[] = [];
	const timed_out: string[] = [];

	settled.forEach((result, index) => {
		const provider = unique_calls[index].provider;

		if (result.status === 'fulfilled') {
			successful.push(provider);
			values.push(result.value);
			return;
		}

		const type = classify_provider_failure(result.reason);
		if (type === ErrorType.TIMEOUT) {
			timed_out.push(provider);
			return;
		}

		failed.push({ provider, type });
	});

	return {
		values,
		metadata: build_partial_success_metadata({
			selected,
			successful,
			failed,
			timed_out,
			preempted: options.preempted,
		}),
	};
};

/**
 * Run one provider and return its results, or run several and return
 * flattened successes plus structured outcome metadata.
 */
export const run_selected_providers = async <T>(
	provider: string | readonly string[],
	run: (id: string) => Promise<T[]>,
	options: SettleProviderCallOptions = {},
): Promise<T[] | PartialSuccessPayload<T>> => {
	if (typeof provider === 'string') {
		return run(provider);
	}

	const { values, metadata } = await settle_provider_calls(
		normalize_provider_selection(provider).map((id) => ({
			provider: id,
			run: () => run(id),
		})),
		options,
	);

	return {
		results: values.flat(),
		metadata,
	};
};
