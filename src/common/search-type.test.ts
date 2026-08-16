import { describe, expect, it } from 'vitest';
import {
	search_type_metadata,
	with_search_type_metadata,
} from './search-type.js';
import type { SearchResult } from './types.js';

const result = (
	overrides: Partial<SearchResult> = {},
): SearchResult => ({
	title: 'Example',
	url: 'https://example.com',
	snippet: 'Summary',
	source_provider: 'brave',
	...overrides,
});

describe('search_type_metadata', () => {
	it('marks news as applied for providers with a native news path', () => {
		expect(search_type_metadata('brave', 'news')).toEqual({
			requested: 'news',
			applied: true,
			provider: 'brave',
			native_value: 'news',
		});
		expect(search_type_metadata('tavily', 'news').applied).toBe(true);
		expect(search_type_metadata('exa', 'news').applied).toBe(true);
		expect(search_type_metadata('kagi_enrichment', 'news')).toEqual({
			requested: 'news',
			applied: true,
			provider: 'kagi_enrichment',
			native_value: 'news',
		});
	});

	it('marks news as not applied for providers without a native news path', () => {
		expect(search_type_metadata('kagi', 'news')).toEqual({
			requested: 'news',
			applied: false,
			provider: 'kagi',
			reason: 'provider kagi does not support search_type news',
		});
	});

	it('treats general search as applied for every provider', () => {
		expect(search_type_metadata('kagi', 'search')).toEqual({
			requested: 'search',
			applied: true,
			provider: 'kagi',
			native_value: 'search',
		});
		expect(search_type_metadata('brave', 'search').applied).toBe(
			true,
		);
	});
});

describe('with_search_type_metadata', () => {
	it('leaves results unchanged when search_type is omitted', () => {
		const results = [result()];

		expect(with_search_type_metadata(results, 'brave')).toEqual(
			results,
		);
	});

	it('attaches search_type metadata without dropping existing fields', () => {
		const results = [
			result({
				metadata: { age: '2 hours ago' },
			}),
		];

		expect(
			with_search_type_metadata(results, 'brave', 'news'),
		).toEqual([
			{
				...results[0],
				metadata: {
					age: '2 hours ago',
					search_type: {
						requested: 'news',
						applied: true,
						provider: 'brave',
						native_value: 'news',
					},
				},
			},
		]);
	});
});
