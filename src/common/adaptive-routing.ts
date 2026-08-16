// Process-local adaptive routing from recent provider health.
//
// Records latency / empty / error outcomes in a small rolling window
// and turns them into a bounded score adjustment. Adjustments can
// break ties and win close calls; they must not override an explicit
// provider or a strong query-class lead. State never includes queries,
// API keys, or vendor error bodies, and is never sent to providers.

import { is_adaptive_routing_enabled } from '../config/env.js';
import { ErrorType, ProviderError } from './types.js';

export const MAX_SAMPLES_PER_PROVIDER = 50;
export const SAMPLE_MAX_AGE_SECONDS = 7 * 24 * 3600;
export const MIN_SAMPLES_FOR_ADJUSTMENT = 5;
export const MAX_SCORE_ADJUSTMENT = 1.0;
export const STRONG_QUERY_CLASS_MARGIN = 1.0;
export const LATENCY_CEILING_SECONDS = 8.0;
export const PERFORMANCE_BASELINE = 0.75;

export type AdaptiveRoutingReason =
	| 'explicit_provider'
	| 'strong_query_class'
	| 'adaptive'
	| 'disabled'
	| 'no_candidates';

export interface ProviderSample {
	t: number;
	lat: number;
	n: number;
	err: boolean;
}

export interface ProviderPerformance {
	samples: number;
	success_rate: number;
	empty_rate: number;
	median_latency_seconds: number | null;
	score_adjustment: number;
}

export interface AdaptiveRoutingDecision {
	selected: string | undefined;
	reason: AdaptiveRoutingReason;
	applied: boolean;
	enabled: boolean;
	base_scores: Record<string, number>;
	adjustments: Record<string, number>;
	adjusted_scores: Record<string, number>;
}

export interface AdaptiveQualityReport {
	enabled: boolean;
	scope: 'process_local';
	applied: boolean;
	reason: AdaptiveRoutingReason;
	selected?: string;
	adjustments: Record<string, number>;
	providers: Record<string, ProviderPerformance>;
}

export interface ApplyAdaptiveRoutingInput {
	candidates: readonly string[];
	base_scores?: Record<string, number>;
	explicit_provider?: string;
	now?: number;
	enabled?: boolean;
}

const provider_samples = new Map<string, ProviderSample[]>();

const now_seconds = () => Date.now() / 1000;

const round3 = (value: number) => Number(value.toFixed(3));

const median = (values: number[]): number => {
	const sorted = [...values].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	return sorted.length % 2
		? sorted[mid]
		: (sorted[mid - 1] + sorted[mid]) / 2;
};

const clamp_adjustment = (value: number) =>
	Math.max(
		-MAX_SCORE_ADJUSTMENT,
		Math.min(MAX_SCORE_ADJUSTMENT, value),
	);

const fresh_samples = (
	provider: string,
	now: number,
): ProviderSample[] => {
	const cutoff = now - SAMPLE_MAX_AGE_SECONDS;
	return (provider_samples.get(provider) ?? []).filter(
		(sample) => sample.t >= cutoff,
	);
};

/**
 * Count results for an outcome sample. Arrays use length; extract
 * payloads with empty `content` count as empty.
 */
export const count_adaptive_results = (result: unknown): number => {
	if (Array.isArray(result)) return result.length;

	if (result && typeof result === 'object') {
		const content = (result as { content?: unknown }).content;
		if (typeof content === 'string') {
			return content.trim() === '' ? 0 : 1;
		}
	}

	return 1;
};

/**
 * True when an error is a caller/validation problem, not provider
 * health. Those must not move adaptive scores.
 */
export const is_non_health_error = (error: unknown): boolean =>
	error instanceof ProviderError &&
	error.type === ErrorType.INVALID_INPUT;

/**
 * Record one local outcome. Stores only timestamp, latency, result
 * count, and an error flag — never queries, keys, or error text.
 */
export const record_provider_outcome = (
	provider: string,
	latency_seconds: number,
	result_count: number,
	error: boolean,
	now?: number,
): void => {
	const sample: ProviderSample = {
		t: Math.floor(now ?? now_seconds()),
		lat: round3(Math.max(0, Number(latency_seconds) || 0)),
		n: Math.max(0, Math.floor(Number(result_count) || 0)),
		err: Boolean(error),
	};
	const samples = provider_samples.get(provider) ?? [];
	samples.push(sample);
	provider_samples.set(
		provider,
		samples.slice(-MAX_SAMPLES_PER_PROVIDER),
	);
};

/**
 * Summarize fresh samples for one provider. Returns zeros when the
 * window is empty.
 */
export const get_provider_performance = (
	provider: string,
	now?: number,
): ProviderPerformance => {
	const now_ts = now ?? now_seconds();
	const samples = fresh_samples(provider, now_ts);
	if (samples.length === 0) {
		return {
			samples: 0,
			success_rate: 0,
			empty_rate: 0,
			median_latency_seconds: null,
			score_adjustment: 0,
		};
	}

	const successes = samples.filter((sample) => !sample.err);
	const empty = successes.filter((sample) => sample.n === 0);
	const latencies = successes.map((sample) => sample.lat);

	return {
		samples: samples.length,
		success_rate: round3(successes.length / samples.length),
		empty_rate: successes.length
			? round3(empty.length / successes.length)
			: 0,
		median_latency_seconds: latencies.length
			? round3(median(latencies))
			: null,
		score_adjustment: provider_performance_adjustment(
			provider,
			now_ts,
		),
	};
};

/**
 * Bounded routing-score adjustment from recent performance.
 * Reliability (success, discounted by empties) plus speed vs an 8s
 * ceiling, then mapped around a 0.75 baseline into ±1.0.
 */
export const provider_performance_adjustment = (
	provider: string,
	now?: number,
): number => {
	const now_ts = now ?? now_seconds();
	const samples = fresh_samples(provider, now_ts);
	if (samples.length < MIN_SAMPLES_FOR_ADJUSTMENT) return 0;

	const successes = samples.filter((sample) => !sample.err);
	const empty = successes.filter((sample) => sample.n === 0);
	const latencies = successes.map((sample) => sample.lat);
	const success_rate = successes.length / samples.length;
	const empty_rate = successes.length
		? empty.length / successes.length
		: 0;
	const reliability = success_rate * (1 - 0.5 * empty_rate);
	const median_latency = latencies.length ? median(latencies) : null;
	const speed =
		median_latency == null
			? 0
			: Math.max(
					0,
					Math.min(1, 1 - median_latency / LATENCY_CEILING_SECONDS),
				);
	const combined = 0.6 * reliability + 0.4 * speed;
	const adjustment =
		(combined - PERFORMANCE_BASELINE) * 2 * MAX_SCORE_ADJUSTMENT;

	return round3(clamp_adjustment(adjustment));
};

/**
 * Non-zero adjustments for the given providers.
 */
export const provider_performance_adjustments = (
	providers: readonly string[],
	now?: number,
): Record<string, number> => {
	const adjustments: Record<string, number> = {};
	for (const provider of providers) {
		const value = provider_performance_adjustment(provider, now);
		if (value !== 0) adjustments[provider] = value;
	}
	return adjustments;
};

const pick_winner = (
	candidates: readonly string[],
	scores: Record<string, number>,
): string => {
	let winner = candidates[0];
	let best = scores[winner] ?? 0;
	for (const candidate of candidates.slice(1)) {
		const score = scores[candidate] ?? 0;
		if (score > best) {
			winner = candidate;
			best = score;
		}
	}
	return winner;
};

const query_class_margin = (
	candidates: readonly string[],
	base_scores: Record<string, number>,
): number => {
	if (candidates.length < 2) return Number.POSITIVE_INFINITY;

	const ranked = [...candidates].sort(
		(left, right) =>
			(base_scores[right] ?? 0) - (base_scores[left] ?? 0),
	);
	return (
		(base_scores[ranked[0]] ?? 0) - (base_scores[ranked[1]] ?? 0)
	);
};

/**
 * Choose a provider from query-class scores plus bounded health
 * adjustments. Explicit provider and a strong query-class lead always
 * win; adaptive scoring only decides close calls.
 */
export const apply_adaptive_routing = (
	input: ApplyAdaptiveRoutingInput,
): AdaptiveRoutingDecision => {
	const enabled = input.enabled ?? is_adaptive_routing_enabled();
	const candidates = input.candidates;
	const base_scores = Object.fromEntries(
		candidates.map((provider) => [
			provider,
			input.base_scores?.[provider] ?? 0,
		]),
	);
	const now = input.now ?? now_seconds();
	const adjustments = enabled
		? provider_performance_adjustments(candidates, now)
		: {};
	const adjusted_scores = Object.fromEntries(
		candidates.map((provider) => [
			provider,
			round3(
				(base_scores[provider] ?? 0) + (adjustments[provider] ?? 0),
			),
		]),
	);

	if (input.explicit_provider) {
		return {
			selected: input.explicit_provider,
			reason: 'explicit_provider',
			applied: false,
			enabled,
			base_scores,
			adjustments,
			adjusted_scores,
		};
	}

	if (candidates.length === 0) {
		return {
			selected: undefined,
			reason: 'no_candidates',
			applied: false,
			enabled,
			base_scores,
			adjustments,
			adjusted_scores,
		};
	}

	if (!enabled) {
		return {
			selected: pick_winner(candidates, base_scores),
			reason: 'disabled',
			applied: false,
			enabled,
			base_scores,
			adjustments: {},
			adjusted_scores: { ...base_scores },
		};
	}

	const margin = query_class_margin(candidates, base_scores);
	if (margin >= STRONG_QUERY_CLASS_MARGIN) {
		return {
			selected: pick_winner(candidates, base_scores),
			reason: 'strong_query_class',
			applied: false,
			enabled,
			base_scores,
			adjustments,
			adjusted_scores,
		};
	}

	return {
		selected: pick_winner(candidates, adjusted_scores),
		reason: 'adaptive',
		applied: true,
		enabled,
		base_scores,
		adjustments,
		adjusted_scores,
	};
};

/**
 * Opt-in quality report. Contains only local aggregates — no keys,
 * queries, or raw vendor errors.
 */
export const build_adaptive_quality_report = (
	input: ApplyAdaptiveRoutingInput,
): AdaptiveQualityReport => {
	const decision = apply_adaptive_routing(input);
	const now = input.now ?? now_seconds();
	const providers = Object.fromEntries(
		input.candidates.map((provider) => [
			provider,
			get_provider_performance(provider, now),
		]),
	);

	return {
		enabled: decision.enabled,
		scope: 'process_local',
		applied: decision.applied,
		reason: decision.reason,
		selected: decision.selected,
		adjustments: decision.adjustments,
		providers,
	};
};

/**
 * Record a finished tool call when it reflects provider health.
 */
export const record_tool_outcome = (input: {
	provider?: string;
	started_at_ms: number;
	result?: unknown;
	error?: unknown;
	result_count?: (result: unknown) => number;
	now?: number;
}): void => {
	if (!input.provider) return;
	if (input.error && is_non_health_error(input.error)) return;

	const latency_seconds = Math.max(
		0,
		(Date.now() - input.started_at_ms) / 1000,
	);
	const result_count = input.error
		? 0
		: (input.result_count ?? count_adaptive_results)(input.result);

	record_provider_outcome(
		input.provider,
		latency_seconds,
		result_count,
		Boolean(input.error),
		input.now,
	);
};

/** Test-only: drop the in-memory window. */
export const reset_adaptive_routing_for_tests = (): void => {
	provider_samples.clear();
};
