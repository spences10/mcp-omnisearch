import { ErrorType, ProviderError } from './types.js';

export type ProviderSkipReason = 'cooldown' | 'quota' | 'timeout';

export const COOLDOWN_STEPS_MS = [
	60_000, // 1 minute
	5 * 60_000, // 5 minutes
	25 * 60_000, // 25 minutes
	60 * 60_000, // 1 hour
] as const;

export interface ProviderHealthOptions {
	now?: () => number;
	steps?: readonly number[];
}

interface HealthEntry {
	consecutive_failures: number;
	cooldown_until: number;
	last_reason: ProviderSkipReason;
}

const is_object_with_name = (
	error: unknown,
): error is { name: string } =>
	typeof error === 'object' &&
	error !== null &&
	'name' in error &&
	typeof error.name === 'string';

export const skip_reason_from_error = (
	error: unknown,
): ProviderSkipReason => {
	if (error instanceof ProviderError) {
		if (
			error.type === ErrorType.RATE_LIMIT ||
			error.type === ErrorType.AUTH_ERROR ||
			error.details?.status === 429
		) {
			return 'quota';
		}

		if (
			error.type === ErrorType.TIMEOUT ||
			error.details?.status === 408
		) {
			return 'timeout';
		}
	}

	if (is_object_with_name(error)) {
		if (
			error.name === 'TimeoutError' ||
			error.name === 'AbortError'
		) {
			return 'timeout';
		}
	}

	return 'cooldown';
};

export class ProviderHealthTracker {
	private readonly entries = new Map<string, HealthEntry>();
	private readonly now: () => number;
	private readonly steps: readonly number[];

	constructor(options: ProviderHealthOptions = {}) {
		this.now = options.now ?? Date.now;
		this.steps = options.steps ?? COOLDOWN_STEPS_MS;
	}

	clear() {
		this.entries.clear();
	}

	is_cooling_down(provider_id: string): boolean {
		const entry = this.entries.get(provider_id);
		if (!entry) return false;
		return this.now() < entry.cooldown_until;
	}

	get_skip_reason(
		provider_id: string,
	): ProviderSkipReason | undefined {
		if (!this.is_cooling_down(provider_id)) return undefined;
		return this.entries.get(provider_id)?.last_reason;
	}

	get_cooldown_until(provider_id: string): string | undefined {
		const entry = this.entries.get(provider_id);
		if (!entry || this.now() >= entry.cooldown_until) {
			return undefined;
		}
		return new Date(entry.cooldown_until).toISOString();
	}

	record_success(provider_id: string) {
		this.entries.delete(provider_id);
	}

	record_failure(provider_id: string, error: unknown) {
		const existing = this.entries.get(provider_id);
		const consecutive_failures =
			(existing?.consecutive_failures ?? 0) + 1;
		const step_index = Math.min(
			consecutive_failures - 1,
			this.steps.length - 1,
		);

		this.entries.set(provider_id, {
			consecutive_failures,
			cooldown_until: this.now() + this.steps[step_index],
			last_reason: skip_reason_from_error(error),
		});
	}
}

export const decorate_status_with_health = <
	T extends { id: string; status: string },
>(
	status: T,
	health: ProviderHealthTracker,
): T & {
	skip_reason?: ProviderSkipReason;
	cooldown_until?: string;
} => {
	if (status.status !== 'available') return status;
	if (!health.is_cooling_down(status.id)) return status;

	return {
		...status,
		skip_reason: 'cooldown',
		cooldown_until: health.get_cooldown_until(status.id),
	};
};
