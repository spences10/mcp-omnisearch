import { describe, expect, it } from 'vitest';
import {
	DEFAULT_RRF_K,
	merge_search_result_lists,
	result_identity_key,
} from './rrf-merge.js';
import type { SearchResult } from './types.js';

const hit = (
	overrides: Partial<SearchResult> &
		Pick<SearchResult, 'source_provider'>,
): SearchResult => ({
	title: overrides.title ?? 'Example',
	url: overrides.url ?? 'https://example.com/docs',
	snippet: overrides.snippet ?? 'snippet',
	source_provider: overrides.source_provider,
	score: overrides.score,
	metadata: overrides.metadata,
});

describe('result_identity_key', () => {
	it('canonicalizes URL scheme, host, trailing slash, and tracking params', () => {
		expect(
			result_identity_key(
				'HTTPS://Example.com/docs/?utm_source=beta&b=2&a=1',
				'Ignored',
			),
		).toBe(
			result_identity_key(
				'https://example.com/docs?a=1&b=2',
				'Other title',
			),
		);
	});

	it('drops default ports and fragments', () => {
		expect(
			result_identity_key(
				'https://example.com:443/docs#section',
				'Docs',
			),
		).toBe(result_identity_key('https://example.com/docs', 'Docs'));
	});

	it('falls back to a normalized title when URL is empty', () => {
		expect(result_identity_key('', '  Title   Only  ')).toBe(
			'title:title only',
		);
	});
});

describe('merge_search_result_lists', () => {
	it('returns a single provider list unchanged without sources', () => {
		const only = [
			hit({
				title: 'One',
				url: 'https://example.com/one',
				source_provider: 'brave',
				score: 0.9,
			}),
		];

		const merged = merge_search_result_lists([only], { limit: 1 });

		expect(merged).toEqual(only);
		expect(merged[0].sources).toBeUndefined();
	});

	it('ignores empty lists so a lone provider stays a plain list', () => {
		const only = [
			hit({
				url: 'https://example.com/one',
				source_provider: 'exa',
			}),
		];

		expect(merge_search_result_lists([[], only, []])).toEqual(only);
		expect(merge_search_result_lists([[], []])).toEqual([]);
	});

	it('fuses overlapping ranks with documented RRF k=60', () => {
		expect(DEFAULT_RRF_K).toBe(60);

		const tavily = [
			hit({
				title: 'Shared',
				url: 'https://example.com/shared',
				snippet: 'from tavily',
				source_provider: 'tavily',
				score: 0.8,
			}),
			hit({
				title: 'Only Tavily',
				url: 'https://example.com/tavily',
				source_provider: 'tavily',
				score: 0.4,
			}),
		];
		const brave = [
			hit({
				title: 'Only Brave',
				url: 'https://example.com/brave',
				source_provider: 'brave',
				score: 0.7,
			}),
			hit({
				title: 'Shared again',
				url: 'https://example.com/shared/',
				snippet: '',
				source_provider: 'brave',
				score: 0.2,
			}),
		];

		const fused = merge_search_result_lists([tavily, brave], {
			k: 60,
		});

		expect(fused.map((result) => result.url)).toEqual([
			'https://example.com/shared/',
			'https://example.com/brave',
			'https://example.com/tavily',
		]);

		// shared: 1/(60+1) + 1/(60+2)
		// brave-only: 1/(60+1)
		// tavily-only: 1/(60+2)
		expect(fused[0].score).toBeCloseTo(1 / 61 + 1 / 62);
		expect(fused[1].score).toBeCloseTo(1 / 61);
		expect(fused[2].score).toBeCloseTo(1 / 62);
		expect(fused[0].snippet).toBe('from tavily');
		expect(fused[0].source_provider).toBe('brave');
		expect(fused[0].sources).toEqual([
			{ provider: 'brave', rank: 2, score: 0.2 },
			{ provider: 'tavily', rank: 1, score: 0.8 },
		]);
	});

	it('collapses duplicate URLs including tracking-query variants', () => {
		const fused = merge_search_result_lists([
			[
				hit({
					title: 'Same',
					url: 'HTTPS://Example.com/docs/?utm_source=beta',
					source_provider: 'beta',
					score: 0.7,
				}),
			],
			[
				hit({
					title: 'Same page',
					url: 'https://example.com/docs',
					snippet: 'preferred deterministic content',
					source_provider: 'alpha',
					score: 0.8,
				}),
				hit({
					title: 'Duplicate from alpha',
					url: 'https://example.com/docs/',
					source_provider: 'alpha',
					score: 0.1,
				}),
				hit({
					title: 'Title only',
					url: '',
					source_provider: 'alpha',
				}),
			],
		]);

		expect(fused).toHaveLength(2);
		expect(fused[0].snippet).toBe('preferred deterministic content');
		expect(
			fused[0].sources?.map((source) => source.provider),
		).toEqual(['alpha', 'beta']);
		expect(fused[0].score).toBeCloseTo(2 / 61);
		expect(fused[1].title).toBe('Title only');
	});

	it('dedupes title-only hits after whitespace and case folding', () => {
		const fused = merge_search_result_lists([
			[
				hit({
					title: 'Title   Only',
					url: '',
					snippet: '',
					source_provider: 'exa',
				}),
			],
			[
				hit({
					title: 'title only',
					url: '   ',
					snippet: 'second',
					source_provider: 'kagi',
				}),
			],
		]);

		expect(fused).toHaveLength(1);
		expect(fused[0].sources).toHaveLength(2);
		expect(fused[0].snippet).toBe('second');
	});

	it('caps the fused list with limit', () => {
		const fused = merge_search_result_lists(
			[
				[
					hit({
						url: 'https://example.com/a',
						source_provider: 'exa',
					}),
				],
				[
					hit({
						url: 'https://example.com/b',
						source_provider: 'brave',
					}),
				],
			],
			{ limit: 1 },
		);

		expect(fused).toHaveLength(1);
	});

	it('uses an explicit k in the RRF denominator', () => {
		const fused = merge_search_result_lists(
			[
				[
					hit({
						url: 'https://example.com/a',
						source_provider: 'exa',
					}),
				],
				[
					hit({
						url: 'https://example.com/a',
						source_provider: 'brave',
					}),
				],
			],
			{ k: 1 },
		);

		expect(fused[0].score).toBeCloseTo(1 / 2 + 1 / 2);
	});
});
