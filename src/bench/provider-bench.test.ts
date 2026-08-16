import { describe, expect, it } from 'vitest';
import { ErrorType, ProviderError } from '../common/types.js';
import {
	PROVIDER_BENCH_SUITE,
	PROVIDER_BENCH_WARNING,
	bench_error_code,
	bench_error_message,
	format_bench_text,
	median,
	normalize_result_url,
	rank_providers,
	run_provider_bench,
	select_bench_providers,
	type BenchProviderSummary,
	type BenchableProvider,
} from './provider-bench.js';

const result = (
	url: string,
	snippet = 'A useful snippet',
	title = 'Example',
) => ({
	title,
	url,
	snippet,
	source_provider: 'test',
});

const provider = (
	id: string,
	search: BenchableProvider['search'],
): BenchableProvider => ({ id, search });

const summary = (
	overrides: Partial<BenchProviderSummary> & { provider: string },
): BenchProviderSummary => ({
	attempts: 4,
	successes: 4,
	success_rate: 1,
	median_latency_ms: 100,
	result_volume: 8,
	unique_urls: 8,
	snippet_coverage: 1,
	...overrides,
});

describe('provider bench helpers', () => {
	it('normalizes URLs for uniqueness', () => {
		expect(
			normalize_result_url('https://Docs.Example.com/Path/'),
		).toBe('https://docs.example.com/Path');
		expect(normalize_result_url('not a url')).toBe('not a url');
	});

	it('computes median for odd, even, and empty lists', () => {
		expect(median([])).toBeNull();
		expect(median([3])).toBe(3);
		expect(median([1, 3, 2])).toBe(2);
		expect(median([4, 2])).toBe(3);
	});

	it('maps provider errors to bounded bench codes', () => {
		expect(
			bench_error_code(
				new ProviderError(ErrorType.AUTH_ERROR, 'bad key', 'brave'),
			),
		).toBe('auth_error');
		expect(
			bench_error_code(
				new ProviderError(ErrorType.RATE_LIMIT, 'slow down', 'brave'),
			),
		).toBe('rate_limited');
		expect(
			bench_error_code(
				new ProviderError(ErrorType.TIMEOUT, 'late', 'brave'),
			),
		).toBe('timeout');
		expect(
			bench_error_code(
				new ProviderError(ErrorType.INVALID_INPUT, 'nope', 'brave'),
			),
		).toBe('invalid_input');
		expect(
			bench_error_code(
				new ProviderError(ErrorType.API_ERROR, 'boom', 'brave'),
			),
		).toBe('provider_error');
		expect(bench_error_code('string')).toBe('provider_error');
		expect(bench_error_message('string')).toBe(
			'Unknown provider error',
		);
		expect(
			bench_error_message(
				new Error(`  too   wide  ${'x'.repeat(300)}`),
			),
		).toHaveLength(240);
	});

	it('selects configured providers and rejects unknown ids', () => {
		const available = [
			provider('brave', async () => []),
			provider('tavily', async () => []),
		];

		expect(
			select_bench_providers(available).map((entry) => entry.id),
		).toEqual(['brave', 'tavily']);
		expect(
			select_bench_providers(available, ['tavily']).map(
				(entry) => entry.id,
			),
		).toEqual(['tavily']);
		expect(() => select_bench_providers([])).toThrow(ProviderError);
		expect(() =>
			select_bench_providers(available, ['missing']),
		).toThrow(/Unknown or unconfigured provider/);
	});

	it('ranks by success, latency, quality, then volume', () => {
		expect(
			rank_providers([
				summary({
					provider: 'slow',
					success_rate: 0.5,
					median_latency_ms: 10,
				}),
				summary({ provider: 'reliable', success_rate: 1 }),
			]),
		).toEqual(['reliable', 'slow']);

		expect(
			rank_providers([
				summary({ provider: 'slow', median_latency_ms: 300 }),
				summary({ provider: 'fast', median_latency_ms: 80 }),
			]),
		).toEqual(['fast', 'slow']);

		expect(
			rank_providers([
				summary({
					provider: 'failed',
					success_rate: 0,
					median_latency_ms: null,
				}),
				summary({ provider: 'ok', median_latency_ms: 200 }),
			]),
		).toEqual(['ok', 'failed']);

		expect(
			rank_providers([
				summary({
					provider: 'thin',
					unique_urls: 2,
					snippet_coverage: 0.2,
				}),
				summary({
					provider: 'rich',
					unique_urls: 8,
					snippet_coverage: 1,
				}),
			]),
		).toEqual(['rich', 'thin']);

		expect(
			rank_providers([
				summary({
					provider: 'few',
					result_volume: 2,
					unique_urls: 2,
				}),
				summary({
					provider: 'many',
					result_volume: 10,
					unique_urls: 10,
				}),
			]),
		).toEqual(['many', 'few']);

		expect(
			rank_providers([
				summary({ provider: 'zeta' }),
				summary({ provider: 'alpha' }),
			]),
		).toEqual(['alpha', 'zeta']);
	});
});

describe('run_provider_bench', () => {
	it('races the fixed suite and recommends a priority without writing config', async () => {
		let clock = 0;
		const report = await run_provider_bench({
			now: () => {
				clock += 40;
				return clock;
			},
			providers: [
				provider('tavily', async () => [
					result('https://svelte.dev/docs'),
					result('https://svelte.dev/docs/'),
				]),
				provider('brave', async ({ query }) => {
					if (query.includes('documentación')) {
						throw new ProviderError(
							ErrorType.TIMEOUT,
							'timed out',
							'brave',
						);
					}
					return [result('https://example.com/a', '')];
				}),
			],
		});

		expect(report.warning).toBe(PROVIDER_BENCH_WARNING);
		expect(report.spent_api_calls).toBe(true);
		expect(report.wrote_config).toBe(false);
		expect(report.feeds_cooldown).toBe(false);
		expect(report.feeds_adaptive_stats).toBe(false);
		expect(report.estimated_requests).toBe(8);
		expect(report.suite.map((entry) => entry.id)).toEqual(
			PROVIDER_BENCH_SUITE.map((entry) => entry.id),
		);
		expect(report.recommended_priority[0]).toBe('tavily');
		expect(report.config_change.applied).toBe(false);
		expect(report.config_change.recommended_provider).toBe('tavily');
		expect(report.config_change.apply).toContain(
			'does not write MCP client or env files',
		);

		const tavily = report.summary.find(
			(entry) => entry.provider === 'tavily',
		)!;
		expect(tavily.successes).toBe(4);
		expect(tavily.unique_urls).toBe(1);
		expect(tavily.snippet_coverage).toBe(1);

		const brave = report.summary.find(
			(entry) => entry.provider === 'brave',
		)!;
		expect(brave.successes).toBe(3);
		expect(brave.snippet_coverage).toBe(0);
		expect(
			report.runs.find(
				(run) =>
					run.provider === 'brave' && run.case_id === 'non_english',
			),
		).toEqual(
			expect.objectContaining({
				ok: false,
				error: {
					code: 'timeout',
					message: 'timed out',
				},
			}),
		);

		const text = format_bench_text(report);
		expect(text).toContain('Warning:');
		expect(text).toContain('Wrote config: no');
		expect(text).toContain('Recommended provider priority: tavily');
		expect(text).toContain('Config change (not applied)');
	});

	it('keeps recommendations empty when every provider fails', async () => {
		const report = await run_provider_bench({
			suite: [PROVIDER_BENCH_SUITE[0]],
			providers: [
				provider('brave', async () => {
					throw new Error('nope');
				}),
			],
		});

		expect(report.config_change.recommended_provider).toBeNull();
		expect(report.config_change.apply).toContain(
			'No provider completed a successful search',
		);
		expect(format_bench_text(report)).toContain('n/a');
	});

	it('formats an empty recommendation list', () => {
		const text = format_bench_text({
			warning: PROVIDER_BENCH_WARNING,
			spent_api_calls: true,
			estimated_requests: 0,
			wrote_config: false,
			feeds_cooldown: false,
			feeds_adaptive_stats: false,
			limit: 5,
			suite: [],
			providers: [],
			runs: [],
			summary: [],
			recommended_priority: [],
			config_change: {
				applied: false,
				recommended_provider: null,
				recommended_priority: [],
				apply: 'none',
			},
		});

		expect(text).toContain('Recommended provider priority: (none)');
	});
});
