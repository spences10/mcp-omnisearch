import { afterEach, describe, expect, it } from 'vitest';
import { ErrorType, ProviderError } from './types.js';
import {
	MAX_SAMPLES_PER_PROVIDER,
	MAX_SCORE_ADJUSTMENT,
	MIN_SAMPLES_FOR_ADJUSTMENT,
	SAMPLE_MAX_AGE_SECONDS,
	STRONG_QUERY_CLASS_MARGIN,
	apply_adaptive_routing,
	build_adaptive_quality_report,
	count_adaptive_results,
	get_provider_performance,
	is_non_health_error,
	provider_performance_adjustment,
	provider_performance_adjustments,
	record_provider_outcome,
	record_tool_outcome,
	reset_adaptive_routing_for_tests,
} from './adaptive-routing.js';

const NOW = 1_700_000_000;

const record_many = (
	provider: string,
	count: number,
	sample: {
		lat: number;
		n: number;
		err: boolean;
	},
	start = NOW,
) => {
	for (let index = 0; index < count; index += 1) {
		record_provider_outcome(
			provider,
			sample.lat,
			sample.n,
			sample.err,
			start + index,
		);
	}
};

afterEach(() => {
	reset_adaptive_routing_for_tests();
	delete process.env.OMNISEARCH_ADAPTIVE_ROUTING;
});

describe('count_adaptive_results', () => {
	it('uses array length and empty extract content', () => {
		expect(count_adaptive_results([{ url: 'https://a' }])).toBe(1);
		expect(count_adaptive_results([])).toBe(0);
		expect(count_adaptive_results({ content: '  ' })).toBe(0);
		expect(count_adaptive_results({ content: 'ok' })).toBe(1);
		expect(count_adaptive_results({ ok: true })).toBe(1);
	});
});

describe('provider outcome window', () => {
	it('keeps only the last 50 samples per provider', () => {
		record_many('brave', MAX_SAMPLES_PER_PROVIDER + 10, {
			lat: 0.4,
			n: 5,
			err: false,
		});

		expect(get_provider_performance('brave', NOW + 60).samples).toBe(
			MAX_SAMPLES_PER_PROVIDER,
		);
	});

	it('ignores samples older than seven days', () => {
		record_provider_outcome('tavily', 0.3, 4, false, NOW);
		record_many(
			'tavily',
			MIN_SAMPLES_FOR_ADJUSTMENT,
			{ lat: 0.3, n: 4, err: false },
			NOW + SAMPLE_MAX_AGE_SECONDS + 10,
		);

		expect(
			get_provider_performance(
				'tavily',
				NOW + SAMPLE_MAX_AGE_SECONDS + 20,
			).samples,
		).toBe(MIN_SAMPLES_FOR_ADJUSTMENT);
	});

	it('stores only timestamp, latency, count, and error flag', () => {
		record_provider_outcome('exa', 1.25, 3, false, NOW);
		const performance = get_provider_performance('exa', NOW);
		const serialized = JSON.stringify(performance);

		expect(serialized).not.toMatch(/api[_-]?key/i);
		expect(serialized).not.toContain('sk-');
		expect(serialized).not.toContain('Bearer');
		expect(performance).toEqual(
			expect.objectContaining({
				samples: 1,
				success_rate: 1,
				empty_rate: 0,
			}),
		);
	});
});

describe('bounded performance adjustments', () => {
	it('returns 0 until the minimum sample count exists', () => {
		record_many('kagi', MIN_SAMPLES_FOR_ADJUSTMENT - 1, {
			lat: 0.2,
			n: 8,
			err: false,
		});

		expect(provider_performance_adjustment('kagi', NOW + 20)).toBe(0);
	});

	it('stays within ±1.0 and rewards healthy providers', () => {
		record_many('healthy', MIN_SAMPLES_FOR_ADJUSTMENT, {
			lat: 0.2,
			n: 8,
			err: false,
		});
		record_many('failing', MIN_SAMPLES_FOR_ADJUSTMENT, {
			lat: 7.5,
			n: 0,
			err: true,
		});
		record_many('empty', MIN_SAMPLES_FOR_ADJUSTMENT, {
			lat: 0.4,
			n: 0,
			err: false,
		});

		const healthy = provider_performance_adjustment(
			'healthy',
			NOW + 20,
		);
		const failing = provider_performance_adjustment(
			'failing',
			NOW + 20,
		);
		const empty = provider_performance_adjustment('empty', NOW + 20);

		expect(healthy).toBeGreaterThan(0);
		expect(failing).toBeLessThan(0);
		expect(empty).toBeLessThan(healthy);
		expect(Math.abs(healthy)).toBeLessThanOrEqual(
			MAX_SCORE_ADJUSTMENT,
		);
		expect(Math.abs(failing)).toBeLessThanOrEqual(
			MAX_SCORE_ADJUSTMENT,
		);
		expect(failing).toBe(-MAX_SCORE_ADJUSTMENT);
	});

	it('omits zero adjustments from the map', () => {
		expect(
			provider_performance_adjustments(['unknown'], NOW),
		).toEqual({});
	});
});

describe('apply_adaptive_routing', () => {
	it('never overrides an explicit provider', () => {
		record_many('brave', MIN_SAMPLES_FOR_ADJUSTMENT, {
			lat: 7,
			n: 0,
			err: true,
		});
		record_many('tavily', MIN_SAMPLES_FOR_ADJUSTMENT, {
			lat: 0.2,
			n: 8,
			err: false,
		});

		const decision = apply_adaptive_routing({
			candidates: ['brave', 'tavily'],
			base_scores: { brave: 0, tavily: 3 },
			explicit_provider: 'brave',
			now: NOW + 20,
		});

		expect(decision).toEqual(
			expect.objectContaining({
				selected: 'brave',
				reason: 'explicit_provider',
				applied: false,
			}),
		);
		expect(decision.adjustments.tavily).toBeGreaterThan(0);
	});

	it('does not let health flip a strong query-class lead', () => {
		record_many('exa', MIN_SAMPLES_FOR_ADJUSTMENT, {
			lat: 7,
			n: 0,
			err: true,
		});
		record_many('brave', MIN_SAMPLES_FOR_ADJUSTMENT, {
			lat: 0.2,
			n: 8,
			err: false,
		});

		const decision = apply_adaptive_routing({
			candidates: ['exa', 'brave'],
			base_scores: {
				exa: STRONG_QUERY_CLASS_MARGIN,
				brave: 0,
			},
			now: NOW + 20,
		});

		expect(decision.selected).toBe('exa');
		expect(decision.reason).toBe('strong_query_class');
		expect(decision.applied).toBe(false);
		expect(decision.adjustments.brave).toBeGreaterThan(0);
		expect(decision.adjustments.exa).toBeLessThan(0);
	});

	it('lets currently healthy providers win close calls', () => {
		record_many('kagi', MIN_SAMPLES_FOR_ADJUSTMENT, {
			lat: 7,
			n: 0,
			err: true,
		});
		record_many('tavily', MIN_SAMPLES_FOR_ADJUSTMENT, {
			lat: 0.2,
			n: 8,
			err: false,
		});

		const decision = apply_adaptive_routing({
			candidates: ['kagi', 'tavily'],
			base_scores: { kagi: 0.2, tavily: 0 },
			now: NOW + 20,
		});

		expect(decision.selected).toBe('tavily');
		expect(decision.reason).toBe('adaptive');
		expect(decision.applied).toBe(true);
	});

	it('honors OMNISEARCH_ADAPTIVE_ROUTING=off', () => {
		process.env.OMNISEARCH_ADAPTIVE_ROUTING = 'off';
		record_many('tavily', MIN_SAMPLES_FOR_ADJUSTMENT, {
			lat: 0.2,
			n: 8,
			err: false,
		});

		const decision = apply_adaptive_routing({
			candidates: ['kagi', 'tavily'],
			base_scores: { kagi: 0.2, tavily: 0 },
			now: NOW + 20,
		});

		expect(decision.selected).toBe('kagi');
		expect(decision.reason).toBe('disabled');
		expect(decision.adjustments).toEqual({});
	});

	it('uses base scores only when adaptive routing is disabled', () => {
		record_many('kagi', MIN_SAMPLES_FOR_ADJUSTMENT, {
			lat: 7,
			n: 0,
			err: true,
		});
		record_many('tavily', MIN_SAMPLES_FOR_ADJUSTMENT, {
			lat: 0.2,
			n: 8,
			err: false,
		});

		const decision = apply_adaptive_routing({
			candidates: ['kagi', 'tavily'],
			base_scores: { kagi: 0.2, tavily: 0 },
			enabled: false,
			now: NOW + 20,
		});

		expect(decision).toEqual(
			expect.objectContaining({
				selected: 'kagi',
				reason: 'disabled',
				applied: false,
				enabled: false,
				adjustments: {},
			}),
		);
	});

	it('returns no_candidates when the pool is empty', () => {
		expect(
			apply_adaptive_routing({
				candidates: [],
				now: NOW,
			}),
		).toEqual(
			expect.objectContaining({
				selected: undefined,
				reason: 'no_candidates',
				applied: false,
			}),
		);
	});
});

describe('quality report and tool recording', () => {
	it('exposes adjustments without secrets or vendor errors', () => {
		record_many('brave', MIN_SAMPLES_FOR_ADJUSTMENT, {
			lat: 0.3,
			n: 4,
			err: false,
		});

		const report = build_adaptive_quality_report({
			candidates: ['brave', 'tavily'],
			explicit_provider: 'brave',
			now: NOW + 20,
		});
		const serialized = JSON.stringify(report);

		expect(report.scope).toBe('process_local');
		expect(report.reason).toBe('explicit_provider');
		expect(report.selected).toBe('brave');
		expect(report.providers.brave.samples).toBe(
			MIN_SAMPLES_FOR_ADJUSTMENT,
		);
		expect(serialized).not.toMatch(/api[_-]?key/i);
		expect(serialized).not.toContain('Authorization');
		expect(serialized).not.toMatch(/rate limit|401|403/i);
	});

	it('records tool success, empty, and error outcomes', () => {
		record_tool_outcome({
			provider: 'brave',
			started_at_ms: Date.now() - 200,
			result: [{ url: 'https://example.com' }],
		});
		record_tool_outcome({
			provider: 'brave',
			started_at_ms: Date.now() - 200,
			result: [],
		});
		record_tool_outcome({
			provider: 'brave',
			started_at_ms: Date.now() - 200,
			error: new Error('vendor boom with key sk-secret'),
		});

		const performance = get_provider_performance('brave');
		expect(performance.samples).toBe(3);
		expect(performance.success_rate).toBeCloseTo(2 / 3, 3);
		expect(JSON.stringify(performance)).not.toContain('sk-secret');
		expect(JSON.stringify(performance)).not.toContain('vendor boom');
	});

	it('does not treat invalid input as provider health', () => {
		expect(
			is_non_health_error(
				new ProviderError(
					ErrorType.INVALID_INPUT,
					'bad mode',
					'web_extract',
				),
			),
		).toBe(true);

		record_tool_outcome({
			provider: 'tavily',
			started_at_ms: Date.now(),
			error: new ProviderError(
				ErrorType.INVALID_INPUT,
				'bad mode',
				'web_extract',
			),
		});

		expect(get_provider_performance('tavily').samples).toBe(0);
	});
});
