import { describe, expect, it } from 'vitest';
import type { ProviderStatus } from '../provider-registry.js';
import {
	attach_quality_report,
	build_quality_report,
	maybe_quality_report,
	skipped_from_status,
} from './quality-report.js';

const status = (
	overrides: Partial<ProviderStatus>,
): ProviderStatus => ({
	id: 'brave',
	name: 'brave',
	category: 'search',
	status: 'available',
	api_key_name: 'BRAVE_API_KEY',
	tools: ['web_search'],
	modes: [],
	capabilities: ['web_search'],
	...overrides,
});

describe('skipped_from_status', () => {
	it('lists unavailable providers without API key names', () => {
		const skipped = skipped_from_status(
			[
				status({ id: 'brave', name: 'brave', status: 'available' }),
				status({
					id: 'tavily',
					name: 'tavily',
					status: 'unavailable',
					unavailable_reason: 'missing_api_key',
					api_key_name: 'TAVILY_API_KEY',
				}),
				status({
					id: 'exa:contents',
					name: 'exa',
					status: 'unavailable',
					unavailable_reason: 'missing_api_key',
					api_key_name: 'EXA_API_KEY',
				}),
				status({
					id: 'exa:similar',
					name: 'exa',
					status: 'unavailable',
					unavailable_reason: 'missing_api_key',
					api_key_name: 'EXA_API_KEY',
				}),
			],
			'brave',
		);

		expect(skipped).toEqual([
			{ provider: 'exa', reason: 'missing_api_key' },
			{ provider: 'tavily', reason: 'missing_api_key' },
		]);
		expect(JSON.stringify(skipped)).not.toMatch(
			/TAVILY_API_KEY|EXA_API_KEY|sk-|Bearer/i,
		);
	});

	it('omits the selected provider even when unavailable', () => {
		expect(
			skipped_from_status(
				[
					status({
						id: 'tavily:extract',
						name: 'tavily',
						status: 'unavailable',
						unavailable_reason: 'missing_api_key',
					}),
				],
				'tavily',
			),
		).toEqual([]);
	});
});

describe('build_quality_report', () => {
	it('reports explicit selection, counts, and thin-snippet extract hint', () => {
		const report = build_quality_report({
			selected_provider: 'brave',
			selection_reason: 'explicit',
			skipped: [{ provider: 'tavily', reason: 'missing_api_key' }],
			cooldown: [{ provider: 'kagi', remaining_ms: 12_000 }],
			results: [
				{
					title: 'One',
					url: 'https://example.com/a',
					snippet: 'short',
					source_provider: 'brave',
				},
				{
					title: 'Two',
					url: 'https://example.com/a/',
					snippet: 'also short',
					source_provider: 'brave',
				},
			],
		});

		expect(report).toEqual({
			selected: { provider: 'brave', reason: 'explicit' },
			scores: [],
			skipped: [{ provider: 'tavily', reason: 'missing_api_key' }],
			cooldown: [{ provider: 'kagi', remaining_ms: 12_000 }],
			auto_excluded: [],
			result_count: 2,
			unique_url_count: 1,
			duplicate_url_rate: 0.5,
			extract_recommended: true,
		});
	});

	it('includes scores when auto-routing supplies them', () => {
		const report = build_quality_report({
			selected_provider: 'exa',
			selection_reason: 'auto_route',
			scores: [
				{ provider: 'exa', score: 0.82 },
				{ provider: 'brave', score: 0.61 },
			],
			results: [],
		});

		expect(report.selected).toEqual({
			provider: 'exa',
			reason: 'auto_route',
		});
		expect(report.scores).toEqual([
			{ provider: 'brave', score: 0.61 },
			{ provider: 'exa', score: 0.82 },
		]);
		expect(report.extract_recommended).toBe(false);
	});

	it('does not recommend extract for rich snippets or processing objects', () => {
		const rich = 'x'.repeat(200);
		expect(
			build_quality_report({
				selected_provider: 'brave',
				selection_reason: 'explicit',
				results: [
					{
						title: 'Docs',
						url: 'https://example.com/docs',
						snippet: rich,
					},
				],
			}).extract_recommended,
		).toBe(false);

		expect(
			build_quality_report({
				selected_provider: 'tavily',
				selection_reason: 'explicit',
				results: {
					content: 'full page',
					source_provider: 'tavily',
					metadata: { successful_extractions: 1 },
				},
			}),
		).toEqual(
			expect.objectContaining({
				result_count: 1,
				extract_recommended: false,
			}),
		);
	});

	it('drops unsafe provider labels and never copies vendor bodies', () => {
		const report = build_quality_report({
			selected_provider: 'sk-live-secret-key',
			selection_reason: 'explicit',
			scores: [{ provider: 'Bearer abc', score: 1 }],
			skipped: [
				{ provider: 'tavily', reason: 'missing_api_key' },
				{
					provider: '{"error":"raw vendor body"}',
					reason: 'unavailable',
				},
			],
			results: [{ url: 'https://example.com', snippet: 'ok' }],
		});

		const serialized = JSON.stringify(report);
		expect(report.selected.provider).toBe('unknown');
		expect(report.scores).toEqual([]);
		expect(report.skipped).toEqual([
			{ provider: 'tavily', reason: 'missing_api_key' },
		]);
		expect(serialized).not.toContain('sk-live-secret-key');
		expect(serialized).not.toContain('raw vendor body');
		expect(serialized).not.toContain('Bearer');
	});
});

describe('attach_quality_report', () => {
	const report = build_quality_report({
		selected_provider: 'brave',
		selection_reason: 'explicit',
		results: [],
	});

	it('wraps arrays and spreads objects', () => {
		expect(attach_quality_report([{ title: 'ok' }], report)).toEqual({
			results: [{ title: 'ok' }],
			quality_report: report,
		});
		expect(
			attach_quality_report(
				{ content: 'page', source_provider: 'tavily' },
				report,
			),
		).toEqual({
			content: 'page',
			source_provider: 'tavily',
			quality_report: report,
		});
	});
});

describe('maybe_quality_report', () => {
	it('is undefined unless explicitly enabled', () => {
		expect(
			maybe_quality_report(undefined, {
				selected_provider: 'brave',
				selection_reason: 'explicit',
			}),
		).toBeUndefined();
		expect(
			maybe_quality_report(false, {
				selected_provider: 'brave',
				selection_reason: 'explicit',
			}),
		).toBeUndefined();

		const builder = maybe_quality_report(true, {
			selected_provider: 'brave',
			selection_reason: 'explicit',
		});
		expect(
			builder?.([{ url: 'https://example.com' }]).selected,
		).toEqual({
			provider: 'brave',
			reason: 'explicit',
		});
	});
});
