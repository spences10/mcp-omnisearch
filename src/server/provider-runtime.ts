import { ErrorType, ProviderError } from '../common/types.js';

export const DEFAULT_RATE_LIMIT_COOLDOWN_MS = 60_000;

export interface ProviderRuntimeState {
	last_error_type: ErrorType | null;
	cooldown: boolean;
}

interface StoredRuntimeState {
	last_error_type: ErrorType;
	cooldown_until: Date | null;
}

const runtime_states = new Map<string, StoredRuntimeState>();

const cooldown_until_for = (
	error: ProviderError,
	now: Date,
): Date | null => {
	if (error.type !== ErrorType.RATE_LIMIT) return null;

	return error.details?.reset_time instanceof Date
		? error.details.reset_time
		: new Date(now.getTime() + DEFAULT_RATE_LIMIT_COOLDOWN_MS);
};

export const clear_provider_runtime = () => {
	runtime_states.clear();
};

export const record_provider_error = (
	error: unknown,
	now: () => Date = () => new Date(),
) => {
	if (!(error instanceof ProviderError)) return;

	runtime_states.set(error.provider, {
		last_error_type: error.type,
		cooldown_until: cooldown_until_for(error, now()),
	});
};

export const get_provider_runtime = (
	provider: string,
	now: () => Date = () => new Date(),
): ProviderRuntimeState => {
	const state = runtime_states.get(provider);
	if (!state) {
		return {
			last_error_type: null,
			cooldown: false,
		};
	}

	return {
		last_error_type: state.last_error_type,
		cooldown:
			state.cooldown_until !== null &&
			state.cooldown_until.getTime() > now().getTime(),
	};
};
