import { describe, expect, it } from 'vitest';
import {
	ai_search_provider_definitions,
	get_default_web_extract_mode,
	get_valid_web_extract_modes,
	github_provider_definitions,
	make_processing_provider_key,
	web_extract_provider_definitions,
	web_search_provider_definitions,
} from './provider-definitions.js';

describe('provider definitions', () => {
	it('declare provider metadata for every tool category', () => {
		expect(
			web_search_provider_definitions.map((definition) => ({
				id: definition.id,
				category: definition.category,
				tools: definition.tools,
			})),
		).toEqual([
			{ id: 'tavily', category: 'search', tools: ['web_search'] },
			{ id: 'brave', category: 'search', tools: ['web_search'] },
			{ id: 'kagi', category: 'search', tools: ['web_search'] },
			{ id: 'exa', category: 'search', tools: ['web_search'] },
			{
				id: 'kagi_enrichment',
				category: 'search',
				tools: ['web_search'],
			},
		]);

		expect(
			ai_search_provider_definitions.map((definition) => ({
				id: definition.id,
				category: definition.category,
				tools: definition.tools,
			})),
		).toEqual([
			{
				id: 'kagi_fastgpt',
				category: 'ai_response',
				tools: ['ai_search'],
			},
			{
				id: 'exa_answer',
				category: 'ai_response',
				tools: ['ai_search'],
			},
			{
				id: 'linkup',
				category: 'ai_response',
				tools: ['ai_search'],
			},
		]);

		expect(github_provider_definitions[0]).toEqual(
			expect.objectContaining({
				id: 'github',
				category: 'search',
				tools: ['github_search'],
				modes: ['code', 'repositories', 'users'],
			}),
		);
	});

	it('uses provider/mode definitions as web_extract routing source of truth', () => {
		expect(
			web_extract_provider_definitions.map((definition) => ({
				id: definition.id,
				name: definition.name,
				mode: definition.modes[0],
				default_mode: definition.default_mode === true,
			})),
		).toEqual([
			{
				id: 'tavily:extract',
				name: 'tavily',
				mode: 'extract',
				default_mode: true,
			},
			{
				id: 'kagi:summarize',
				name: 'kagi',
				mode: 'summarize',
				default_mode: true,
			},
			{
				id: 'firecrawl:scrape',
				name: 'firecrawl',
				mode: 'scrape',
				default_mode: true,
			},
			{
				id: 'firecrawl:crawl',
				name: 'firecrawl',
				mode: 'crawl',
				default_mode: false,
			},
			{
				id: 'firecrawl:map',
				name: 'firecrawl',
				mode: 'map',
				default_mode: false,
			},
			{
				id: 'firecrawl:extract',
				name: 'firecrawl',
				mode: 'extract',
				default_mode: false,
			},
			{
				id: 'firecrawl:actions',
				name: 'firecrawl',
				mode: 'actions',
				default_mode: false,
			},
			{
				id: 'exa:contents',
				name: 'exa',
				mode: 'contents',
				default_mode: true,
			},
			{
				id: 'exa:similar',
				name: 'exa',
				mode: 'similar',
				default_mode: false,
			},
		]);

		expect(get_default_web_extract_mode('firecrawl')).toBe('scrape');
		expect(get_valid_web_extract_modes('firecrawl')).toEqual([
			'scrape',
			'crawl',
			'map',
			'extract',
			'actions',
		]);
		expect(make_processing_provider_key('exa', 'contents')).toBe(
			'exa:contents',
		);
	});
});
