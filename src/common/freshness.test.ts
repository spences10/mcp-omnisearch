import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	attach_freshness_metadata,
	brave_freshness_param,
	exa_start_published_date,
	freshness_start_date,
	kagi_freshness_after,
	normalize_freshness,
	provider_supports_freshness,
	tavily_time_range,
} from './freshness.js';

describe('freshness', () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it('normalizes case-insensitive day/week/month/year values', () => {
		expect(normalize_freshness('DAY')).toBe('day');
		expect(normalize_freshness(' Week ')).toBe('week');
		expect(normalize_freshness('month')).toBe('month');
		expect(normalize_freshness('YEAR')).toBe('year');
	});

	it('rejects invalid freshness values with a clear error', () => {
		expect(() => normalize_freshness('yesterday')).toThrow(
			/freshness must be one of: day, week, month, year/i,
		);
	});

	it('maps freshness to each provider native parameter', () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-08-16T12:00:00.000Z'));

		expect(brave_freshness_param('day')).toBe('pd');
		expect(brave_freshness_param('week')).toBe('pw');
		expect(brave_freshness_param('month')).toBe('pm');
		expect(brave_freshness_param('year')).toBe('py');

		expect(tavily_time_range('week')).toBe('week');
		expect(freshness_start_date('week')).toBe('2026-08-09');
		expect(kagi_freshness_after('week')).toBe('after:2026-08-09');
		expect(exa_start_published_date('week')).toBe(
			'2026-08-09T12:00:00.000Z',
		);
	});

	it('reports recency support truthfully per provider', () => {
		expect(provider_supports_freshness('brave')).toBe(true);
		expect(provider_supports_freshness('tavily')).toBe(true);
		expect(provider_supports_freshness('kagi')).toBe(true);
		expect(provider_supports_freshness('exa')).toBe(true);
		expect(provider_supports_freshness('kagi_enrichment')).toBe(
			false,
		);
	});

	it('attaches freshness metadata without claiming unsupported filters ran', () => {
		const results = [
			{
				title: 'Result',
				url: 'https://example.com',
				snippet: 'Summary',
				source_provider: 'kagi_enrichment',
				metadata: { extra: true },
			},
		];

		expect(
			attach_freshness_metadata(results, undefined, false),
		).toEqual(results);
		expect(attach_freshness_metadata(results, 'week', false)).toEqual(
			[
				{
					...results[0],
					metadata: {
						extra: true,
						freshness: { requested: 'week', applied: false },
					},
				},
			],
		);
	});
});
