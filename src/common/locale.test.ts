import { describe, expect, it, vi } from 'vitest';
import {
	detect_location_country,
	infer_query_language,
	locale_metadata_for_provider,
	parse_country,
	parse_language,
	resolve_search_locale,
	to_tavily_country,
	warn_invalid_locale_config,
	with_locale_metadata,
} from './locale.js';

describe('parse_country', () => {
	it('accepts ISO 3166-1 alpha-2 codes case-insensitively', () => {
		expect(parse_country('AT')).toBe('at');
		expect(parse_country('ch')).toBe('ch');
	});

	it('maps common country aliases and location names', () => {
		expect(parse_country('USA')).toBe('us');
		expect(parse_country('United-Kingdom')).toBe('gb');
		expect(parse_country('austria')).toBe('at');
		expect(parse_country('vienna')).toBe('at');
	});

	it('rejects empty or invalid values', () => {
		expect(parse_country(undefined)).toBeUndefined();
		expect(parse_country('')).toBeUndefined();
		expect(parse_country('usa!')).toBeUndefined();
		expect(parse_country('eng')).toBeUndefined();
	});
});

describe('parse_language', () => {
	it('accepts ISO 639-1 codes and auto', () => {
		expect(parse_language('DE')).toBe('de');
		expect(parse_language('auto')).toBe('auto');
	});

	it('rejects empty or invalid values', () => {
		expect(parse_language(undefined)).toBeUndefined();
		expect(parse_language('eng')).toBeUndefined();
		expect(parse_language('de-AT')).toBeUndefined();
	});
});

describe('resolve_search_locale', () => {
	it('leaves current behavior unchanged without config or params', () => {
		expect(
			resolve_search_locale({
				query: 'beste Kaffeehäuser Wien Öffnungszeiten',
			}),
		).toEqual({ active: false });
	});

	it('uses config country and language when set', () => {
		expect(
			resolve_search_locale({
				query: 'weather',
				config_country: 'AT',
				config_language: 'de',
			}),
		).toEqual({
			active: true,
			country: 'at',
			country_source: 'config',
			language: 'de',
			language_source: 'config',
		});
	});

	it('lets per-call params win over config', () => {
		expect(
			resolve_search_locale({
				query: 'weather',
				config_country: 'at',
				config_language: 'de',
				param_country: 'ch',
				param_language: 'fr',
			}),
		).toEqual({
			active: true,
			country: 'ch',
			country_source: 'param',
			language: 'fr',
			language_source: 'param',
		});
	});

	it('does not change country when query language is inferred', () => {
		expect(
			resolve_search_locale({
				query: 'beste Kaffeehäuser Öffnungszeiten heute',
				config_country: 'ch',
				config_language: 'auto',
			}),
		).toEqual({
			active: true,
			country: 'ch',
			country_source: 'config',
			language: 'de',
			language_source: 'inferred',
		});
	});

	it('uses loc: and lang: operators as inferred per-call overrides', () => {
		expect(
			resolve_search_locale({
				query: 'news loc:us lang:en',
				config_country: 'at',
				config_language: 'de',
			}),
		).toEqual({
			active: true,
			country: 'us',
			country_source: 'inferred',
			language: 'en',
			language_source: 'inferred',
		});
	});

	it('uses an unambiguous location hint without changing language', () => {
		expect(
			resolve_search_locale({
				query: 'cafes in Vienna',
				config_country: 'us',
				config_language: 'en',
			}),
		).toEqual({
			active: true,
			country: 'at',
			country_source: 'inferred',
			language: 'en',
			language_source: 'config',
		});
	});

	it('ignores conflicting location hints so config keeps country', () => {
		expect(
			resolve_search_locale({
				query: 'Paris vs Madrid',
				config_country: 'us',
			}),
		).toEqual({
			active: true,
			country: 'us',
			country_source: 'config',
		});
	});

	it('does not infer language for terse technical queries', () => {
		expect(
			resolve_search_locale({
				query: 'DAC R2R NOS',
				config_language: 'auto',
			}),
		).toEqual({ active: true });
	});

	it('lets an explicit language param win over lang: operators', () => {
		expect(
			resolve_search_locale({
				query: 'news lang:en',
				param_language: 'de',
			}),
		).toEqual({
			active: true,
			language: 'de',
			language_source: 'param',
		});
	});
});

describe('detect_location_country and infer_query_language', () => {
	it('requires a single agreed location hint', () => {
		expect(detect_location_country('cafes in Vienna')).toBe('at');
		expect(
			detect_location_country('Paris vs Madrid'),
		).toBeUndefined();
	});

	it('requires a clear language winner', () => {
		expect(
			infer_query_language('beste Kaffeehäuser Öffnungszeiten heute'),
		).toBe('de');
		expect(infer_query_language('DAC R2R NOS')).toBeUndefined();
	});
});

describe('to_tavily_country', () => {
	it('maps ISO codes to English country names', () => {
		expect(to_tavily_country('at')).toBe('austria');
		expect(to_tavily_country('gb')).toBe('united kingdom');
		expect(to_tavily_country('United-Kingdom')).toBe(
			'united kingdom',
		);
	});
});

describe('locale metadata', () => {
	it('omits metadata for providers without locale params', () => {
		expect(
			locale_metadata_for_provider('exa', {
				active: true,
				country: 'at',
				country_source: 'config',
			}),
		).toBeUndefined();
	});

	it('reports only country for Tavily', () => {
		expect(
			locale_metadata_for_provider('tavily', {
				active: true,
				country: 'at',
				country_source: 'config',
				language: 'de',
				language_source: 'param',
			}),
		).toEqual({
			locale: {
				country: 'at',
				source: { country: 'config' },
			},
		});
	});

	it('reports country and language for Brave and Kagi', () => {
		expect(
			locale_metadata_for_provider('brave', {
				active: true,
				country: 'ch',
				country_source: 'param',
				language: 'de',
				language_source: 'inferred',
			}),
		).toEqual({
			locale: {
				country: 'ch',
				language: 'de',
				source: {
					country: 'param',
					language: 'inferred',
				},
			},
		});
	});

	it('merges locale metadata onto search results', () => {
		expect(
			with_locale_metadata(
				[
					{
						title: 'Result',
						url: 'https://example.com',
						snippet: 'Summary',
						source_provider: 'kagi',
						metadata: { rank: 1 },
					},
				],
				'kagi',
				{
					active: true,
					country: 'at',
					country_source: 'config',
				},
			),
		).toEqual([
			{
				title: 'Result',
				url: 'https://example.com',
				snippet: 'Summary',
				source_provider: 'kagi',
				metadata: {
					rank: 1,
					locale: {
						country: 'at',
						source: { country: 'config' },
					},
				},
			},
		]);
	});
});

describe('warn_invalid_locale_config', () => {
	it('warns for invalid country and language values', () => {
		const warn = vi.fn();

		warn_invalid_locale_config(
			{
				OMNISEARCH_COUNTRY: 'austria-at',
				OMNISEARCH_LANGUAGE: 'german',
			},
			warn,
		);

		expect(warn).toHaveBeenCalledTimes(2);
		expect(warn.mock.calls[0]?.[0]).toContain('OMNISEARCH_COUNTRY');
		expect(warn.mock.calls[1]?.[0]).toContain('OMNISEARCH_LANGUAGE');
	});

	it('does not warn for valid or empty locale config', () => {
		const warn = vi.fn();

		warn_invalid_locale_config(
			{
				OMNISEARCH_COUNTRY: 'at',
				OMNISEARCH_LANGUAGE: 'auto',
			},
			warn,
		);
		warn_invalid_locale_config({}, warn);

		expect(warn).not.toHaveBeenCalled();
	});
});
