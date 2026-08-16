import {
	ErrorType,
	ProviderError,
	type BaseSearchParams,
	type SearchResult,
} from '../common/types.js';

export const PROVIDER_BENCH_WARNING =
	'This benchmark spends real API calls and quota. It is read-only: it does not write config and does not update cooldown or adaptive routing stats.';

export const PROVIDER_BENCH_DEFAULT_LIMIT = 5;

export interface BenchCase {
	id: 'docs' | 'vendor_release' | 'community' | 'non_english';
	label: string;
	query: string;
}

export const PROVIDER_BENCH_SUITE: readonly BenchCase[] = [
	{
		id: 'docs',
		label: 'docs',
		query: 'SvelteKit remote functions official documentation',
	},
	{
		id: 'vendor_release',
		label: 'vendor release',
		query: 'Node.js 22 release notes',
	},
	{
		id: 'community',
		label: 'community',
		query: 'Svelte 5 runes community discussion',
	},
	{
		id: 'non_english',
		label: 'non-English',
		query: 'documentación oficial de SvelteKit',
	},
];

export interface BenchableProvider {
	id: string;
	search: (params: BaseSearchParams) => Promise<SearchResult[]>;
}

export type BenchErrorCode =
	| 'auth_error'
	| 'rate_limited'
	| 'timeout'
	| 'invalid_input'
	| 'provider_error';

export interface BenchRun {
	provider: string;
	case_id: BenchCase['id'];
	ok: boolean;
	latency_ms: number;
	result_count: number;
	unique_urls: number;
	snippet_coverage: number;
	error?: {
		code: BenchErrorCode;
		message: string;
	};
}

export interface BenchProviderSummary {
	provider: string;
	attempts: number;
	successes: number;
	success_rate: number;
	median_latency_ms: number | null;
	result_volume: number;
	unique_urls: number;
	snippet_coverage: number;
}

export interface ProviderBenchReport {
	warning: string;
	spent_api_calls: true;
	estimated_requests: number;
	wrote_config: false;
	feeds_cooldown: false;
	feeds_adaptive_stats: false;
	limit: number;
	suite: Array<{ id: BenchCase['id']; label: string; query: string }>;
	providers: string[];
	runs: BenchRun[];
	summary: BenchProviderSummary[];
	recommended_priority: string[];
	config_change: {
		applied: false;
		recommended_provider: string | null;
		recommended_priority: string[];
		apply: string;
	};
}

export interface RunProviderBenchOptions {
	providers: BenchableProvider[];
	suite?: readonly BenchCase[];
	limit?: number;
	now?: () => number;
}

export const normalize_result_url = (url: string): string => {
	try {
		const parsed = new URL(url);
		parsed.hash = '';
		parsed.hostname = parsed.hostname.toLowerCase();
		if (parsed.pathname.endsWith('/') && parsed.pathname !== '/') {
			parsed.pathname = parsed.pathname.slice(0, -1);
		}
		return parsed.toString();
	} catch {
		return url.trim();
	}
};

export const median = (values: readonly number[]): number | null => {
	if (values.length === 0) return null;
	const sorted = [...values].sort((a, b) => a - b);
	const middle = Math.floor(sorted.length / 2);
	if (sorted.length % 2 === 0) {
		return (sorted[middle - 1] + sorted[middle]) / 2;
	}
	return sorted[middle];
};

export const bench_error_code = (error: unknown): BenchErrorCode => {
	if (error instanceof ProviderError) {
		switch (error.type) {
			case ErrorType.AUTH_ERROR:
				return 'auth_error';
			case ErrorType.RATE_LIMIT:
				return 'rate_limited';
			case ErrorType.TIMEOUT:
				return 'timeout';
			case ErrorType.INVALID_INPUT:
				return 'invalid_input';
			default:
				return 'provider_error';
		}
	}
	return 'provider_error';
};

export const bench_error_message = (error: unknown): string => {
	if (error instanceof Error && error.message.trim()) {
		return error.message.replace(/\s+/g, ' ').slice(0, 240);
	}
	return 'Unknown provider error';
};

export const select_bench_providers = (
	available: readonly BenchableProvider[],
	requested?: readonly string[],
): BenchableProvider[] => {
	if (available.length === 0) {
		throw new ProviderError(
			ErrorType.INVALID_INPUT,
			'No web_search providers are configured. Set at least one search API key.',
			'provider_bench',
		);
	}

	const sorted_available = [...available].sort((left, right) =>
		left.id.localeCompare(right.id),
	);

	if (!requested || requested.length === 0) {
		return sorted_available;
	}

	const by_id = new Map(
		sorted_available.map((provider) => [provider.id, provider]),
	);
	const missing = requested.filter((id) => !by_id.has(id));
	if (missing.length > 0) {
		throw new ProviderError(
			ErrorType.INVALID_INPUT,
			`Unknown or unconfigured provider(s): ${missing.join(', ')}. Available: ${sorted_available.map((provider) => provider.id).join(', ')}`,
			'provider_bench',
		);
	}

	return requested.map((id) => by_id.get(id)!);
};

const quality_score = (summary: BenchProviderSummary): number => {
	const unique_ratio =
		summary.result_volume === 0
			? 0
			: summary.unique_urls / summary.result_volume;
	return unique_ratio * 0.5 + summary.snippet_coverage * 0.5;
};

export const rank_providers = (
	summaries: readonly BenchProviderSummary[],
): string[] =>
	[...summaries]
		.sort((left, right) => {
			if (right.success_rate !== left.success_rate) {
				return right.success_rate - left.success_rate;
			}

			const left_latency = left.median_latency_ms;
			const right_latency = right.median_latency_ms;
			if (left_latency === null && right_latency !== null) return 1;
			if (left_latency !== null && right_latency === null) return -1;
			if (
				left_latency !== null &&
				right_latency !== null &&
				left_latency !== right_latency
			) {
				return left_latency - right_latency;
			}

			const quality_delta =
				quality_score(right) - quality_score(left);
			if (quality_delta !== 0) return quality_delta;

			if (right.result_volume !== left.result_volume) {
				return right.result_volume - left.result_volume;
			}

			return left.provider.localeCompare(right.provider);
		})
		.map((summary) => summary.provider);

const summarize_provider = (
	provider: string,
	runs: readonly BenchRun[],
	url_union: ReadonlySet<string>,
	snippet_hits: number,
	snippet_total: number,
): BenchProviderSummary => {
	const successes = runs.filter((run) => run.ok);
	const result_volume = successes.reduce(
		(sum, run) => sum + run.result_count,
		0,
	);

	return {
		provider,
		attempts: runs.length,
		successes: successes.length,
		success_rate:
			runs.length === 0 ? 0 : successes.length / runs.length,
		median_latency_ms: median(successes.map((run) => run.latency_ms)),
		result_volume,
		unique_urls: url_union.size,
		snippet_coverage:
			snippet_total === 0 ? 0 : snippet_hits / snippet_total,
	};
};

const run_case = async (
	provider: BenchableProvider,
	test_case: BenchCase,
	limit: number,
	now: () => number,
): Promise<{
	run: BenchRun;
	urls: string[];
	snippet_hits: number;
}> => {
	const started = now();
	try {
		const results = await provider.search({
			query: test_case.query,
			limit,
		});
		const latency_ms = Math.max(0, Math.round(now() - started));
		const urls = results.map((result) =>
			normalize_result_url(result.url),
		);
		const snippet_hits = results.filter(
			(result) => result.snippet.trim().length > 0,
		).length;

		return {
			run: {
				provider: provider.id,
				case_id: test_case.id,
				ok: true,
				latency_ms,
				result_count: results.length,
				unique_urls: new Set(urls).size,
				snippet_coverage:
					results.length === 0 ? 0 : snippet_hits / results.length,
			},
			urls,
			snippet_hits,
		};
	} catch (error) {
		return {
			run: {
				provider: provider.id,
				case_id: test_case.id,
				ok: false,
				latency_ms: Math.max(0, Math.round(now() - started)),
				result_count: 0,
				unique_urls: 0,
				snippet_coverage: 0,
				error: {
					code: bench_error_code(error),
					message: bench_error_message(error),
				},
			},
			urls: [],
			snippet_hits: 0,
		};
	}
};

export const run_provider_bench = async ({
	providers,
	suite = PROVIDER_BENCH_SUITE,
	limit = PROVIDER_BENCH_DEFAULT_LIMIT,
	now = () => performance.now(),
}: RunProviderBenchOptions): Promise<ProviderBenchReport> => {
	const selected = select_bench_providers(providers);
	const runs: BenchRun[] = [];
	const urls_by_provider = new Map<string, Set<string>>();
	const snippets_by_provider = new Map<
		string,
		{ hits: number; total: number }
	>();

	for (const provider of selected) {
		urls_by_provider.set(provider.id, new Set());
		snippets_by_provider.set(provider.id, { hits: 0, total: 0 });
	}

	for (const test_case of suite) {
		for (const provider of selected) {
			const { run, urls, snippet_hits } = await run_case(
				provider,
				test_case,
				limit,
				now,
			);
			runs.push(run);
			for (const url of urls) {
				urls_by_provider.get(provider.id)!.add(url);
			}
			const snippets = snippets_by_provider.get(provider.id)!;
			snippets.hits += snippet_hits;
			snippets.total += run.result_count;
		}
	}

	const summary = selected.map((provider) => {
		const snippets = snippets_by_provider.get(provider.id)!;
		return summarize_provider(
			provider.id,
			runs.filter((run) => run.provider === provider.id),
			urls_by_provider.get(provider.id)!,
			snippets.hits,
			snippets.total,
		);
	});

	const recommended_priority = rank_providers(summary);
	const recommended_provider =
		summary.find(
			(entry) =>
				entry.provider === recommended_priority[0] &&
				entry.successes > 0,
		)?.provider ?? null;

	const apply = recommended_provider
		? `Use provider "${recommended_provider}" first on web_search. Suggested priority: ${recommended_priority.join(',')}. This command does not write MCP client or env files.`
		: 'No provider completed a successful search. Check API keys and retry. This command does not write MCP client or env files.';

	return {
		warning: PROVIDER_BENCH_WARNING,
		spent_api_calls: true,
		estimated_requests: selected.length * suite.length,
		wrote_config: false,
		feeds_cooldown: false,
		feeds_adaptive_stats: false,
		limit,
		suite: suite.map((test_case) => ({
			id: test_case.id,
			label: test_case.label,
			query: test_case.query,
		})),
		providers: selected.map((provider) => provider.id),
		runs,
		summary,
		recommended_priority,
		config_change: {
			applied: false,
			recommended_provider,
			recommended_priority,
			apply,
		},
	};
};

export const format_bench_text = (
	report: ProviderBenchReport,
): string => {
	const lines = [
		`Warning: ${report.warning}`,
		`Estimated requests: ${report.estimated_requests} (${report.providers.length} providers × ${report.suite.length} queries)`,
		'Wrote config: no',
		'Feeds cooldown / adaptive stats: no',
		'',
		'Provider          Success  Median   Volume  Unique  Snippets',
	];

	for (const entry of report.summary) {
		const median_label =
			entry.median_latency_ms === null
				? 'n/a'
				: `${Math.round(entry.median_latency_ms)}ms`;
		const snippets = `${Math.round(entry.snippet_coverage * 100)}%`;
		lines.push(
			`${entry.provider.padEnd(17)} ${String(entry.successes).padStart(1)}/${entry.attempts}     ${median_label.padEnd(7)} ${String(entry.result_volume).padEnd(7)} ${String(entry.unique_urls).padEnd(7)} ${snippets}`,
		);
	}

	lines.push('');
	lines.push(
		`Recommended provider priority: ${report.recommended_priority.join(', ') || '(none)'}`,
	);
	lines.push(
		`Config change (not applied): ${report.config_change.apply}`,
	);

	return lines.join('\n');
};
