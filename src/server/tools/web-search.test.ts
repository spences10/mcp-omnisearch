import { afterEach, describe, expect, it } from 'vitest';
import type { SearchResult } from '../../common/types.js';
import { merge_web_search_results } from './web-search.js';

const hit = (
	overrides: Partial<SearchResult> &
		Pick<SearchResult, 'source_provider' | 'url'>,
): SearchResult => ({
	title: overrides.title ?? overrides.url,
	url: overrides.url,
	snippet: overrides.snippet ?? '',
	source_provider: overrides.source_provider,
	score: overrides.score,
});

afterEach(() => {
	delete process.env.OMNISEARCH_RRF_K;
});

describe('merge_web_search_results', () => {
	it('keeps a single provider response as a plain list', () => {
		const results = [
			hit({
				url: 'https://example.com/a',
				source_provider: 'brave',
				score: 0.5,
			}),
		];

		expect(merge_web_search_results([results], { limit: 5 })).toEqual(
			results,
		);
	});

	it('fuses multiple provider lists with provenance and limit', () => {
		const fused = merge_web_search_results(
			[
				[
					hit({
						url: 'https://example.com/shared',
						source_provider: 'tavily',
						score: 0.9,
					}),
				],
				[
					hit({
						url: 'https://example.com/shared',
						source_provider: 'exa',
						score: 0.4,
					}),
					hit({
						url: 'https://example.com/other',
						source_provider: 'exa',
					}),
				],
			],
			{ limit: 1 },
		);

		expect(fused).toHaveLength(1);
		expect(fused[0].sources).toEqual([
			{ provider: 'exa', rank: 1, score: 0.4 },
			{ provider: 'tavily', rank: 1, score: 0.9 },
		]);
	});

	it('honors OMNISEARCH_RRF_K when fusing lists', () => {
		process.env.OMNISEARCH_RRF_K = '1';

		const fused = merge_web_search_results([
			[
				hit({
					url: 'https://example.com/a',
					source_provider: 'brave',
				}),
			],
			[
				hit({
					url: 'https://example.com/a',
					source_provider: 'exa',
				}),
			],
		]);

		expect(fused[0].score).toBeCloseTo(1);
	});
});
