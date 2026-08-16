import type { FreshnessValue, SearchResult } from './types.js';

export type { FreshnessValue };

export const FRESHNESS_VALUES = [
	'day',
	'week',
	'month',
	'year',
] as const;

export interface FreshnessMetadata {
	requested: FreshnessValue;
	applied: boolean;
}

const FRESHNESS_DAYS: Record<FreshnessValue, number> = {
	day: 1,
	week: 7,
	month: 30,
	year: 365,
};

const BRAVE_FRESHNESS_PARAM: Record<FreshnessValue, string> = {
	day: 'pd',
	week: 'pw',
	month: 'pm',
	year: 'py',
};

const FRESHNESS_PROVIDERS = new Set([
	'brave',
	'tavily',
	'kagi',
	'exa',
]);

const INVALID_FRESHNESS_MESSAGE =
	'freshness must be one of: day, week, month, year';

export const is_freshness_value = (
	value: string,
): value is FreshnessValue =>
	(FRESHNESS_VALUES as readonly string[]).includes(value);

export const normalize_freshness = (
	value: string,
): FreshnessValue => {
	const normalized = value.trim().toLowerCase();
	if (!is_freshness_value(normalized)) {
		throw new Error(INVALID_FRESHNESS_MESSAGE);
	}
	return normalized;
};

export const provider_supports_freshness = (provider: string) =>
	FRESHNESS_PROVIDERS.has(provider);

export const brave_freshness_param = (freshness: FreshnessValue) =>
	BRAVE_FRESHNESS_PARAM[freshness];

export const tavily_time_range = (freshness: FreshnessValue) =>
	freshness;

export const freshness_start_date = (
	freshness: FreshnessValue,
	now: Date = new Date(),
) =>
	new Date(
		now.getTime() - FRESHNESS_DAYS[freshness] * 24 * 60 * 60 * 1000,
	)
		.toISOString()
		.slice(0, 10);

export const kagi_freshness_after = (
	freshness: FreshnessValue,
	now: Date = new Date(),
) => `after:${freshness_start_date(freshness, now)}`;

export const exa_start_published_date = (
	freshness: FreshnessValue,
	now: Date = new Date(),
) =>
	new Date(
		now.getTime() - FRESHNESS_DAYS[freshness] * 24 * 60 * 60 * 1000,
	).toISOString();

export const attach_freshness_metadata = (
	results: SearchResult[],
	freshness: FreshnessValue | undefined,
	applied: boolean,
): SearchResult[] => {
	if (!freshness) return results;

	return results.map((result) => ({
		...result,
		metadata: {
			...result.metadata,
			freshness: {
				requested: freshness,
				applied,
			} satisfies FreshnessMetadata,
		},
	}));
};
