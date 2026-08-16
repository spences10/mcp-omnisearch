import type { ProviderStatus } from '../provider-registry.js';

const PROVIDER_ID = /^[a-z][a-z0-9_]{0,31}$/;
const THIN_SNIPPET_CHARS = 160;

export type SelectionReason =
	| 'explicit'
	| 'implicit'
	| 'auto_route'
	| 'failover';

export type SkipReason =
	| 'missing_api_key'
	| 'cooldown'
	| 'auto_excluded'
	| 'unavailable';

export interface QualityReportScore {
	provider: string;
	score: number;
}

export interface QualityReportSkip {
	provider: string;
	reason: SkipReason;
}

export interface QualityReportCooldown {
	provider: string;
	remaining_ms?: number;
}

export interface QualityReport {
	selected: {
		provider: string;
		reason: SelectionReason;
	};
	scores: QualityReportScore[];
	skipped: QualityReportSkip[];
	cooldown: QualityReportCooldown[];
	auto_excluded: QualityReportSkip[];
	result_count: number;
	unique_url_count: number;
	duplicate_url_rate: number;
	extract_recommended: boolean;
}

export interface BuildQualityReportInput {
	selected_provider: string;
	selection_reason: SelectionReason;
	scores?: readonly QualityReportScore[];
	skipped?: readonly QualityReportSkip[];
	cooldown?: readonly QualityReportCooldown[];
	auto_excluded?: readonly QualityReportSkip[];
	results?: unknown;
}

const safe_provider = (value: string): string =>
	PROVIDER_ID.test(value) ? value : 'unknown';

const by_provider = <T extends { provider: string }>(
	left: T,
	right: T,
) => left.provider.localeCompare(right.provider);

const sanitize_scores = (
	scores: readonly QualityReportScore[] = [],
): QualityReportScore[] =>
	scores
		.filter(
			(score) =>
				PROVIDER_ID.test(score.provider) &&
				Number.isFinite(score.score),
		)
		.map((score) => ({
			provider: score.provider,
			score: score.score,
		}))
		.sort(by_provider);

const sanitize_skips = (
	entries: readonly QualityReportSkip[] = [],
): QualityReportSkip[] =>
	entries
		.filter((entry) => PROVIDER_ID.test(entry.provider))
		.map((entry) => ({
			provider: entry.provider,
			reason: entry.reason,
		}))
		.sort(by_provider);

const sanitize_cooldown = (
	entries: readonly QualityReportCooldown[] = [],
): QualityReportCooldown[] =>
	entries
		.filter((entry) => PROVIDER_ID.test(entry.provider))
		.map((entry) => {
			const remaining_ms = entry.remaining_ms;
			return Number.isFinite(remaining_ms)
				? { provider: entry.provider, remaining_ms }
				: { provider: entry.provider };
		})
		.sort(by_provider);

const collect_urls = (value: unknown): string[] => {
	if (Array.isArray(value)) {
		return value.flatMap(collect_urls);
	}

	if (!value || typeof value !== 'object') {
		return [];
	}

	const record = value as Record<string, unknown>;
	const urls: string[] = [];

	if (typeof record.url === 'string') {
		urls.push(record.url);
	}

	if (Array.isArray(record.raw_contents)) {
		urls.push(...collect_urls(record.raw_contents));
	}

	return urls;
};

const canonicalize_url = (url: string): string => {
	try {
		const parsed = new URL(url);
		parsed.hash = '';
		parsed.hostname = parsed.hostname.toLowerCase();
		if (parsed.pathname !== '/' && parsed.pathname.endsWith('/')) {
			parsed.pathname = parsed.pathname.slice(0, -1);
		}
		return parsed.toString();
	} catch {
		return url.trim().toLowerCase();
	}
};

const count_results = (results: unknown): number => {
	if (results == null) return 0;
	if (Array.isArray(results)) return results.length;

	if (typeof results === 'object') {
		const metadata = (
			results as { metadata?: Record<string, unknown> }
		).metadata;
		const extracted = metadata?.successful_extractions;
		if (typeof extracted === 'number' && Number.isFinite(extracted)) {
			return extracted;
		}
		return 1;
	}

	return 0;
};

const snippets_from = (results: unknown): string[] => {
	if (!Array.isArray(results)) return [];

	return results.flatMap((item) => {
		if (!item || typeof item !== 'object') return [];
		const snippet = (item as { snippet?: unknown }).snippet;
		return typeof snippet === 'string' ? [snippet] : [];
	});
};

const recommend_extract = (results: unknown): boolean => {
	if (!Array.isArray(results) || results.length === 0) {
		return false;
	}

	const url_results = results.filter(
		(item) =>
			item &&
			typeof item === 'object' &&
			typeof (item as { url?: unknown }).url === 'string',
	);

	if (url_results.length === 0) {
		return false;
	}

	const snippets = snippets_from(url_results);
	if (snippets.length === 0) {
		return true;
	}

	const thin = snippets.filter(
		(snippet) => snippet.trim().length < THIN_SNIPPET_CHARS,
	).length;

	return thin >= Math.ceil(snippets.length / 2);
};

export const skipped_from_status = (
	entries: readonly ProviderStatus[],
	selected: string,
): QualityReportSkip[] => {
	const seen = new Set<string>();
	const skipped: QualityReportSkip[] = [];

	for (const entry of entries) {
		if (entry.id === selected || entry.name === selected) continue;
		if (entry.status !== 'unavailable') continue;
		if (seen.has(entry.name)) continue;

		seen.add(entry.name);
		skipped.push({
			provider: entry.name,
			reason:
				entry.unavailable_reason === 'missing_api_key'
					? 'missing_api_key'
					: 'unavailable',
		});
	}

	return sanitize_skips(skipped);
};

export const build_quality_report = (
	input: BuildQualityReportInput,
): QualityReport => {
	const urls = collect_urls(input.results);
	const unique_urls = new Set(urls.map(canonicalize_url));
	const result_count = count_results(input.results);
	const unique_url_count = unique_urls.size;
	const duplicate_url_rate =
		urls.length === 0
			? 0
			: Number(
					((urls.length - unique_url_count) / urls.length).toFixed(4),
				);

	return {
		selected: {
			provider: safe_provider(input.selected_provider),
			reason: input.selection_reason,
		},
		scores: sanitize_scores(input.scores),
		skipped: sanitize_skips(input.skipped),
		cooldown: sanitize_cooldown(input.cooldown),
		auto_excluded: sanitize_skips(input.auto_excluded),
		result_count,
		unique_url_count,
		duplicate_url_rate,
		extract_recommended: recommend_extract(input.results),
	};
};

export const attach_quality_report = <T>(
	payload: T,
	report: QualityReport,
) => {
	if (Array.isArray(payload)) {
		return { results: payload, quality_report: report };
	}

	if (payload && typeof payload === 'object') {
		return { ...payload, quality_report: report };
	}

	return { results: payload, quality_report: report };
};

export const maybe_quality_report = (
	enabled: boolean | undefined,
	input: Omit<BuildQualityReportInput, 'results'>,
): ((raw: unknown) => QualityReport) | undefined =>
	enabled
		? (raw) => build_quality_report({ ...input, results: raw })
		: undefined;
