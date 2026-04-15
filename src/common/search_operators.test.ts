import { describe, expect, it } from 'vitest';
import {
	apply_search_operators,
	build_query_with_operators,
	parse_search_operators,
} from './search_operators.js';

describe('parse_search_operators', () => {
	it('extracts supported operators and preserves the base query', () => {
		const parsed = parse_search_operators(
			'sveltekit site:kit.svelte.dev -site:spam.dev filetype:pdf ext:md intitle:guide inurl:docs inbody:"load" inpage:"actions" lang:en location:us before:2024-01-01 after:2023-01-01 "remote functions" +forms -legacy AND OR NOT',
		);

		expect(parsed.base_query).toBe('sveltekit');
		expect(parsed.operators).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					type: 'site',
					value: 'kit.svelte.dev',
				}),
				expect.objectContaining({
					type: 'exclude_site',
					value: 'spam.dev',
				}),
				expect.objectContaining({
					type: 'filetype',
					value: 'pdf',
				}),
				expect.objectContaining({
					type: 'ext',
					value: 'md',
				}),
				expect.objectContaining({
					type: 'intitle',
					value: 'guide',
				}),
				expect.objectContaining({
					type: 'inurl',
					value: 'docs',
				}),
				expect.objectContaining({
					type: 'inbody',
					value: 'load',
				}),
				expect.objectContaining({
					type: 'inpage',
					value: 'actions',
				}),
				expect.objectContaining({
					type: 'language',
					value: 'en',
				}),
				expect.objectContaining({
					type: 'location',
					value: 'us',
				}),
				expect.objectContaining({
					type: 'before',
					value: '2024-01-01',
				}),
				expect.objectContaining({
					type: 'after',
					value: '2023-01-01',
				}),
				expect.objectContaining({
					type: 'exact',
					value: 'remote functions',
				}),
				expect.objectContaining({
					type: 'force_include',
					value: 'forms',
				}),
				expect.objectContaining({
					type: 'exclude_term',
					value: 'legacy',
				}),
				expect.objectContaining({
					type: 'boolean',
					value: 'AND',
				}),
				expect.objectContaining({
					type: 'boolean',
					value: 'OR',
				}),
				expect.objectContaining({
					type: 'boolean',
					value: 'NOT',
				}),
			]),
		);
	});
});

describe('apply_search_operators', () => {
	it('maps parsed operators into structured search params', () => {
		const params = apply_search_operators({
			base_query: 'sveltekit',
			operators: [
				{ type: 'site', value: 'kit.svelte.dev', original_text: '' },
				{
					type: 'exclude_site',
					value: 'spam.dev',
					original_text: '',
				},
				{ type: 'filetype', value: 'pdf', original_text: '' },
				{ type: 'intitle', value: 'guide', original_text: '' },
				{ type: 'inurl', value: 'docs', original_text: '' },
				{ type: 'inbody', value: 'load', original_text: '' },
				{ type: 'inpage', value: 'actions', original_text: '' },
				{ type: 'language', value: 'en', original_text: '' },
				{ type: 'location', value: 'us', original_text: '' },
				{ type: 'before', value: '2024-01-01', original_text: '' },
				{ type: 'after', value: '2023-01-01', original_text: '' },
				{
					type: 'exact',
					value: 'remote functions',
					original_text: '',
				},
				{ type: 'force_include', value: 'forms', original_text: '' },
				{ type: 'exclude_term', value: 'legacy', original_text: '' },
				{ type: 'boolean', value: 'AND', original_text: '' },
			],
		});

		expect(params).toEqual({
			query: 'sveltekit',
			include_domains: ['kit.svelte.dev'],
			exclude_domains: ['spam.dev'],
			file_type: 'pdf',
			title_filter: 'guide',
			url_filter: 'docs',
			body_filter: 'load',
			page_filter: 'actions',
			language: 'en',
			location: 'us',
			date_before: '2024-01-01',
			date_after: '2023-01-01',
			exact_phrases: ['remote functions'],
			force_include_terms: ['forms'],
			exclude_terms: ['legacy'],
			boolean_operators: [{ type: 'AND', terms: [] }],
		});
	});
});

describe('build_query_with_operators', () => {
	it('rebuilds the query with explicit and parsed filters', () => {
		const query = build_query_with_operators(
			{
				query: 'sveltekit',
				include_domains: ['kit.svelte.dev'],
				exclude_domains: ['spam.dev'],
				file_type: 'pdf',
				title_filter: 'guide',
				url_filter: 'docs',
				body_filter: 'load',
				page_filter: 'actions',
				language: 'en',
				location: 'us',
				date_before: '2024-01-01',
				date_after: '2023-01-01',
				exact_phrases: ['remote functions'],
				force_include_terms: ['forms'],
				exclude_terms: ['legacy'],
			},
			['docs.example.com'],
			['ads.example.com'],
		);

		expect(query).toBe(
			'sveltekit site:docs.example.com OR site:kit.svelte.dev -site:ads.example.com -site:spam.dev filetype:pdf intitle:guide inurl:docs inbody:load inpage:actions lang:en loc:us before:2024-01-01 after:2023-01-01 "remote functions" +forms -legacy',
		);
	});

	it('can exclude file type and date filters for provider-specific handling', () => {
		const query = build_query_with_operators(
			{
				query: 'sveltekit',
				file_type: 'pdf',
				date_before: '2024-01-01',
				date_after: '2023-01-01',
				exact_phrases: ['remote functions'],
			},
			undefined,
			undefined,
			{ exclude_file_type: true, exclude_dates: true },
		);

		expect(query).toBe('sveltekit "remote functions"');
	});
});
