import * as v from 'valibot';
import { describe, expect, it } from 'vitest';
import {
	create_web_search_schema,
	domain_schema,
	has_exactly_one_provider_selector,
	http_url_schema,
	include_raw_contents_schema,
	large_result_mode_schema,
	limit_schema,
	providers_schema,
	query_schema,
	url_or_urls_schema,
} from './schemas.js';

describe('tool schemas', () => {
	it('accepts non-empty queries and rejects empty queries', () => {
		expect(v.parse(query_schema, 'sveltekit')).toBe('sveltekit');
		expect(v.safeParse(query_schema, '').success).toBe(false);
		expect(v.safeParse(query_schema, '   ').success).toBe(false);
	});

	it('bounds result limits', () => {
		expect(v.safeParse(limit_schema, undefined).success).toBe(true);
		expect(v.safeParse(limit_schema, 1).success).toBe(true);
		expect(v.safeParse(limit_schema, 50).success).toBe(true);
		expect(v.safeParse(limit_schema, 0).success).toBe(false);
		expect(v.safeParse(limit_schema, 51).success).toBe(false);
		expect(v.safeParse(limit_schema, 1.5).success).toBe(false);
	});

	it('validates large-result and extraction payload controls', () => {
		expect(
			v.safeParse(large_result_mode_schema, undefined).success,
		).toBe(true);
		expect(
			v.safeParse(large_result_mode_schema, 'inline').success,
		).toBe(true);
		expect(
			v.safeParse(large_result_mode_schema, 'file').success,
		).toBe(true);
		expect(v.safeParse(large_result_mode_schema, 'tmp').success).toBe(
			false,
		);
		expect(
			v.safeParse(include_raw_contents_schema, false).success,
		).toBe(true);
		expect(
			v.safeParse(include_raw_contents_schema, 'false').success,
		).toBe(false);
	});

	it('accepts hostnames but rejects URLs as domain filters', () => {
		expect(v.parse(domain_schema, 'docs.example.com')).toBe(
			'docs.example.com',
		);
		expect(v.parse(domain_schema, '*.example.com')).toBe(
			'*.example.com',
		);
		expect(
			v.safeParse(domain_schema, 'https://example.com').success,
		).toBe(false);
		expect(
			v.safeParse(domain_schema, 'example.com/path').success,
		).toBe(false);
	});

	it('accepts only http and https URLs', () => {
		expect(v.parse(http_url_schema, 'https://example.com')).toBe(
			'https://example.com',
		);
		expect(
			v.safeParse(http_url_schema, 'HTTP://example.com').success,
		).toBe(false);
		expect(
			v.safeParse(http_url_schema, 'ftp://example.com').success,
		).toBe(false);
		expect(v.safeParse(http_url_schema, 'not a url').success).toBe(
			false,
		);
	});

	it('accepts known concurrent providers and rejects empty lists', () => {
		expect(
			v.safeParse(providers_schema, ['exa', 'tavily']).success,
		).toBe(true);
		expect(v.safeParse(providers_schema, undefined).success).toBe(
			true,
		);
		expect(v.safeParse(providers_schema, []).success).toBe(false);
		expect(
			v.safeParse(providers_schema, ['exa', 'unknown']).success,
		).toBe(false);
	});

	it('requires exactly one of provider or providers', () => {
		expect(
			has_exactly_one_provider_selector({ provider: 'exa' }),
		).toBe(true);
		expect(
			has_exactly_one_provider_selector({
				providers: ['exa', 'tavily'],
			}),
		).toBe(true);
		expect(has_exactly_one_provider_selector({})).toBe(false);
		expect(
			has_exactly_one_provider_selector({
				provider: 'exa',
				providers: ['tavily'],
			}),
		).toBe(false);
	});

	it('keeps single-provider web_search payloads valid and rejects mixed selectors', () => {
		const schema = create_web_search_schema(['exa', 'tavily']);

		expect(
			v.safeParse(schema, { query: 'sveltekit', provider: 'exa' })
				.success,
		).toBe(true);
		expect(
			v.safeParse(schema, {
				query: 'sveltekit',
				providers: ['exa', 'tavily'],
			}).success,
		).toBe(true);
		expect(
			v.safeParse(schema, {
				query: 'sveltekit',
				provider: 'exa',
				providers: ['tavily'],
			}).success,
		).toBe(false);
		expect(v.safeParse(schema, { query: 'sveltekit' }).success).toBe(
			false,
		);
		expect(
			v.safeParse(schema, { query: 'sveltekit', provider: 'brave' })
				.success,
		).toBe(false);
	});

	it('bounds extraction URL arrays', () => {
		expect(
			v.safeParse(url_or_urls_schema, 'https://example.com').success,
		).toBe(true);
		expect(v.safeParse(url_or_urls_schema, []).success).toBe(false);
		expect(
			v.safeParse(
				url_or_urls_schema,
				Array.from(
					{ length: 11 },
					(_, index) => `https://example.com/${index}`,
				),
			).success,
		).toBe(false);
	});
});
