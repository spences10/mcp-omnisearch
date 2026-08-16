import {
	ErrorType,
	ProviderError,
	type BaseSearchParams,
	type ProcessingResult,
	type SearchResult,
} from '../../common/types.js';
import {
	DEFAULT_RESEARCH_EXTRACT_COUNT,
	DEFAULT_RESEARCH_TIME_BUDGET_SECONDS,
	RESEARCH_EARLY_STOP_CONTRIBUTORS,
	dedupe_search_results,
	default_research_clock,
	normalize_result_url,
	research_error_message,
	research_timeout_error,
	select_research_search_providers,
	type ResearchClock,
	type ResearchExtractProvider,
	type ResearchExtractReport,
	type ResearchModeParams,
	type ResearchModeResult,
	type ResearchProviderFailure,
	type ResearchSearchProvider,
	type ResearchSkippedProvider,
	type SearchOutcome,
} from './research-helpers.js';

export {
	DEFAULT_RESEARCH_EXTRACT_COUNT,
	DEFAULT_RESEARCH_TIME_BUDGET_SECONDS,
	MAX_RESEARCH_SEARCH_PROVIDERS,
	RESEARCH_EARLY_STOP_CONTRIBUTORS,
	RESEARCH_EXTRACT_PREFERENCE,
	RESEARCH_SEARCH_CAPABILITY,
	dedupe_search_results,
	normalize_result_url,
	select_research_extract_provider,
	select_research_search_providers,
} from './research-helpers.js';
export type {
	ResearchClock,
	ResearchExtractProvider,
	ResearchModeParams,
	ResearchModeResult,
	ResearchSearchProvider,
} from './research-helpers.js';

export const run_research_mode = async (
	params: ResearchModeParams,
	search_providers: readonly ResearchSearchProvider[],
	extract_provider?: ResearchExtractProvider,
): Promise<ResearchModeResult> => {
	const clock = params.clock ?? default_research_clock;
	const time_budget_seconds =
		params.time_budget_seconds ??
		DEFAULT_RESEARCH_TIME_BUDGET_SECONDS;
	const extract_enabled = params.extract !== false;
	const extract_count =
		params.extract_count ?? DEFAULT_RESEARCH_EXTRACT_COUNT;
	const start = clock.now();
	const budget_ms = time_budget_seconds * 1000;
	const remaining = () => budget_ms - (clock.now() - start);

	const selected = select_research_search_providers(
		search_providers,
		params.preferred_provider,
	);
	if (selected.length === 0) {
		throw new ProviderError(
			ErrorType.INVALID_INPUT,
			'No eligible search providers are available for research mode',
			'web_search',
		);
	}

	const succeeded: string[] = [];
	const failed: ResearchProviderFailure[] = [];
	const skipped: ResearchSkippedProvider[] = [];
	const timed_out: string[] = [];
	const results_by_provider = new Map<string, SearchResult[]>();
	const contributors = new Set<string>();
	const seen_urls = new Set<string>();
	const pending = new Map<string, Promise<SearchOutcome>>();

	for (const provider of selected) {
		const timeout_ms = remaining();
		if (timeout_ms <= 0) {
			skipped.push({
				provider: provider.id,
				reason: 'time_budget_exhausted',
			});
			continue;
		}

		const search_params: BaseSearchParams = {
			query: params.query,
			limit: params.limit,
			include_domains: params.include_domains,
			exclude_domains: params.exclude_domains,
		};

		pending.set(
			provider.id,
			clock
				.timeout(
					provider.search(search_params).then(
						(results) =>
							({
								id: provider.id,
								status: 'ok',
								results,
							}) satisfies SearchOutcome,
						(error) =>
							({
								id: provider.id,
								status: 'error',
								error,
							}) satisfies SearchOutcome,
					),
					timeout_ms,
					research_timeout_error(provider.id),
				)
				.catch(
					(error) =>
						({
							id: provider.id,
							status: 'timeout',
							error,
						}) satisfies SearchOutcome,
				),
		);
	}

	while (pending.size > 0) {
		if (contributors.size >= RESEARCH_EARLY_STOP_CONTRIBUTORS) {
			for (const id of pending.keys()) {
				skipped.push({ provider: id, reason: 'early_stop' });
			}
			break;
		}

		const outcome = await Promise.race(pending.values());
		pending.delete(outcome.id);

		if (outcome.status === 'timeout') {
			timed_out.push(outcome.id);
			continue;
		}
		if (outcome.status === 'error') {
			failed.push({
				provider: outcome.id,
				error: research_error_message(outcome.error),
			});
			continue;
		}

		succeeded.push(outcome.id);
		results_by_provider.set(outcome.id, outcome.results);
		for (const result of outcome.results) {
			const key = normalize_result_url(result.url);
			if (!key || seen_urls.has(key)) continue;
			seen_urls.add(key);
			contributors.add(outcome.id);
		}
	}

	const merged: SearchResult[] = [];
	for (const provider of selected) {
		const rows = results_by_provider.get(provider.id);
		if (rows) merged.push(...rows);
	}
	const results = dedupe_search_results(merged, params.limit ?? 10);
	const extract_urls = results
		.map((result) => result.url)
		.filter(Boolean)
		.slice(0, extract_count);

	const extract = await run_research_extract({
		clock,
		extract_enabled,
		extract_provider,
		remaining_ms: remaining(),
		urls: extract_urls,
	});

	return {
		mode: 'research',
		results,
		extracts:
			extract.status === 'succeeded' ? extract.result : undefined,
		research: {
			time_budget_seconds,
			elapsed_ms: Math.max(0, clock.now() - start),
			selected: selected.map((provider) => provider.id),
			succeeded,
			failed,
			skipped,
			timed_out,
			extract: {
				provider: extract_provider?.id,
				status: extract.status,
				urls: extract_urls,
				error: extract.error,
				reason: extract.reason,
			},
		},
	};
};

const run_research_extract = async ({
	clock,
	extract_enabled,
	extract_provider,
	remaining_ms,
	urls,
}: {
	clock: ResearchClock;
	extract_enabled: boolean;
	extract_provider?: ResearchExtractProvider;
	remaining_ms: number;
	urls: string[];
}): Promise<{
	status: ResearchExtractReport['status'];
	reason?: ResearchExtractReport['reason'];
	error?: string;
	result?: ProcessingResult;
}> => {
	if (!extract_enabled) {
		return { status: 'skipped', reason: 'disabled' };
	}
	if (urls.length === 0) {
		return { status: 'skipped', reason: 'no_urls' };
	}
	if (!extract_provider) {
		return { status: 'skipped', reason: 'no_extract_provider' };
	}
	if (remaining_ms <= 0) {
		return { status: 'skipped', reason: 'time_budget_exhausted' };
	}

	try {
		const result = await clock.timeout(
			extract_provider.process_content(urls),
			remaining_ms,
			research_timeout_error(extract_provider.id),
		);
		return { status: 'succeeded', result };
	} catch (error) {
		if (
			error instanceof ProviderError &&
			error.type === ErrorType.TIMEOUT
		) {
			return { status: 'timed_out', error: error.message };
		}
		return {
			status: 'failed',
			error: research_error_message(error),
		};
	}
};
