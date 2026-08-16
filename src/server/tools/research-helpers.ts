import {
	ErrorType,
	ProviderError,
	type BaseSearchParams,
	type ProcessingResult,
	type SearchResult,
} from '../../common/types.js';

export const DEFAULT_RESEARCH_TIME_BUDGET_SECONDS = 55;
export const DEFAULT_RESEARCH_EXTRACT_COUNT = 3;
export const MAX_RESEARCH_SEARCH_PROVIDERS = 4;
export const RESEARCH_EARLY_STOP_CONTRIBUTORS = 2;
export const RESEARCH_SEARCH_CAPABILITY = 'web_search';

export const RESEARCH_EXTRACT_PREFERENCE = [
	'tavily:extract',
	'firecrawl:scrape',
	'exa:contents',
	'kagi:summarize',
] as const;

export interface ResearchSearchProvider {
	id: string;
	capabilities?: readonly string[];
	search(params: BaseSearchParams): Promise<SearchResult[]>;
}

export interface ResearchExtractProvider {
	id: string;
	name: string;
	modes?: readonly string[];
	process_content(
		url: string | string[],
		extract_depth?: 'basic' | 'advanced',
	): Promise<ProcessingResult>;
}

export interface ResearchClock {
	now(): number;
	timeout<T>(
		promise: Promise<T>,
		timeout_ms: number,
		error: Error,
	): Promise<T>;
}

export interface ResearchModeParams extends BaseSearchParams {
	preferred_provider?: string;
	time_budget_seconds?: number;
	extract?: boolean;
	extract_count?: number;
	clock?: ResearchClock;
}

export interface ResearchProviderFailure {
	provider: string;
	error: string;
}

export interface ResearchSkippedProvider {
	provider: string;
	reason: 'early_stop' | 'time_budget_exhausted';
}

export interface ResearchExtractReport {
	provider?: string;
	status: 'succeeded' | 'failed' | 'skipped' | 'timed_out';
	urls: string[];
	error?: string;
	reason?:
		| 'disabled'
		| 'no_extract_provider'
		| 'no_urls'
		| 'time_budget_exhausted';
}

export interface ResearchModeResult {
	mode: 'research';
	results: SearchResult[];
	extracts?: ProcessingResult;
	research: {
		time_budget_seconds: number;
		elapsed_ms: number;
		selected: string[];
		succeeded: string[];
		failed: ResearchProviderFailure[];
		skipped: ResearchSkippedProvider[];
		timed_out: string[];
		extract: ResearchExtractReport;
	};
}

export type SearchOutcome =
	| { id: string; status: 'ok'; results: SearchResult[] }
	| { id: string; status: 'error'; error: unknown }
	| { id: string; status: 'timeout'; error: unknown };

const with_timeout = async <T>(
	promise: Promise<T>,
	timeout_ms: number,
	error: Error,
): Promise<T> => {
	const guarded = promise.then(
		(value) => ({ ok: true as const, value }),
		(cause) => ({ ok: false as const, cause }),
	);
	if (timeout_ms <= 0) throw error;

	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		const winner = await Promise.race([
			guarded,
			new Promise<never>((_, reject) => {
				timer = setTimeout(() => reject(error), timeout_ms);
			}),
		]);
		if (winner.ok) return winner.value;
		throw winner.cause;
	} finally {
		if (timer) clearTimeout(timer);
	}
};

export const default_research_clock: ResearchClock = {
	now: () => Date.now(),
	timeout: (promise, timeout_ms, error) =>
		with_timeout(promise, timeout_ms, error),
};

export const normalize_result_url = (url: string): string => {
	try {
		const parsed = new URL(url);
		parsed.hash = '';
		parsed.hostname = parsed.hostname
			.replace(/^www\./i, '')
			.toLowerCase();
		let normalized = parsed.toString();
		if (parsed.pathname !== '/' && normalized.endsWith('/')) {
			normalized = normalized.slice(0, -1);
		}
		return normalized;
	} catch {
		return url.trim();
	}
};

export const dedupe_search_results = (
	results: SearchResult[],
	limit = 10,
): SearchResult[] => {
	const seen = new Set<string>();
	const deduped: SearchResult[] = [];

	for (const result of results) {
		const key = normalize_result_url(result.url);
		if (!key || seen.has(key)) continue;
		seen.add(key);
		deduped.push(result);
		if (deduped.length >= limit) break;
	}

	return deduped;
};

export const select_research_search_providers = (
	entries: readonly ResearchSearchProvider[],
	preferred?: string,
): ResearchSearchProvider[] => {
	const by_id = new Map(entries.map((entry) => [entry.id, entry]));
	const eligible = entries.filter((entry) =>
		(entry.capabilities ?? []).includes(RESEARCH_SEARCH_CAPABILITY),
	);
	const pool = eligible.length > 0 ? eligible : [...entries];
	const selected: ResearchSearchProvider[] = [];

	const preferred_entry = preferred
		? by_id.get(preferred)
		: undefined;
	if (preferred_entry) selected.push(preferred_entry);

	for (const entry of pool) {
		if (selected.length >= MAX_RESEARCH_SEARCH_PROVIDERS) break;
		if (selected.some((item) => item.id === entry.id)) continue;
		selected.push(entry);
	}

	return selected;
};

export const select_research_extract_provider = <
	T extends { id: string },
>(
	entries: readonly T[],
): T | undefined => {
	const by_id = new Map(entries.map((entry) => [entry.id, entry]));
	for (const id of RESEARCH_EXTRACT_PREFERENCE) {
		const match = by_id.get(id);
		if (match) return match;
	}
	return undefined;
};

export const research_error_message = (error: unknown): string =>
	error instanceof Error ? error.message : String(error);

export const research_timeout_error = (provider: string) =>
	new ProviderError(
		ErrorType.TIMEOUT,
		`${provider} timed out: research time budget exhausted`,
		provider,
		{ retryable: true },
	);
