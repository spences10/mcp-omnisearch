import { describe, expect, it } from 'vitest';
import { ErrorType, ProviderError } from '../common/types.js';
import {
	AI_SEARCH_PRIORITY,
	WEB_EXTRACT_PRIORITY,
	WEB_SEARCH_PRIORITY,
	detect_query_signals,
	get_last_routing_decision,
	is_auto_provider,
	select_provider,
} from './auto-routing.js';

const web_search_candidates = WEB_SEARCH_PRIORITY.map((name) => ({
	name,
}));

const ai_search_candidates = AI_SEARCH_PRIORITY.map((name) => ({
	name,
}));

const web_extract_candidates = [
	{ name: 'tavily', modes: ['extract'] },
	{
		name: 'firecrawl',
		modes: ['scrape', 'crawl', 'map', 'extract', 'actions'],
	},
	{ name: 'kagi', modes: ['summarize'] },
	{ name: 'exa', modes: ['contents', 'similar'] },
];

describe('is_auto_provider', () => {
	it('treats omitted and auto as auto-routing', () => {
		expect(is_auto_provider(undefined)).toBe(true);
		expect(is_auto_provider('auto')).toBe(true);
		expect(is_auto_provider('AUTO')).toBe(true);
	});

	it('treats an explicit provider name as an override', () => {
		expect(is_auto_provider('tavily')).toBe(false);
		expect(is_auto_provider('brave')).toBe(false);
	});
});

describe('detect_query_signals', () => {
	it('detects operator, freshness, news, and semantic signals', () => {
		expect(
			detect_query_signals('site:docs.svelte.dev svelte'),
		).toEqual(expect.arrayContaining(['operators']));
		expect(
			detect_query_signals('latest news today about the fed'),
		).toEqual(expect.arrayContaining(['freshness', 'news']));
		expect(
			detect_query_signals(
				'similar research papers about transformers',
			),
		).toEqual(expect.arrayContaining(['semantic']));
	});

	it('detects docs, academic, and extract-oriented signals', () => {
		expect(
			detect_query_signals('sveltekit documentation how to'),
		).toEqual(expect.arrayContaining(['docs_code']));
		expect(
			detect_query_signals('arxiv transformer architecture paper'),
		).toEqual(expect.arrayContaining(['academic']));
		expect(
			detect_query_signals('https://www.youtube.com/watch?v=abc'),
		).toEqual(expect.arrayContaining(['video']));
		expect(
			detect_query_signals(
				'https://docs.python.org/3/library/os.html',
			),
		).toEqual(expect.arrayContaining(['docs_site']));
	});
});

describe('select_provider', () => {
	it('lets an explicit provider win without scoring', () => {
		const decision = select_provider({
			tool: 'web_search',
			provider: 'tavily',
			query: 'similar research papers about transformers',
			candidates: web_search_candidates,
		});

		expect(decision).toEqual(
			expect.objectContaining({
				tool: 'web_search',
				provider: 'tavily',
				source: 'explicit',
			}),
		);
		expect(decision.scores).toEqual([]);
		expect(get_last_routing_decision()).toEqual(decision);
	});

	it('picks exactly one configured winner when provider is omitted', () => {
		const decision = select_provider({
			tool: 'web_search',
			query: 'what is the capital of france',
			candidates: web_search_candidates,
		});

		expect(decision.source).toBe('auto');
		expect(decision.provider).toBe('tavily');
		expect(decision.scores).toHaveLength(
			web_search_candidates.length,
		);
		expect(decision.reason.length).toBeGreaterThan(0);
	});

	it('treats provider auto the same as an omitted provider', () => {
		const omitted = select_provider({
			tool: 'web_search',
			query: 'sveltekit remote functions',
			candidates: web_search_candidates,
		});
		const auto = select_provider({
			tool: 'web_search',
			provider: 'auto',
			query: 'sveltekit remote functions',
			candidates: web_search_candidates,
		});

		expect(auto.provider).toBe(omitted.provider);
		expect(auto.source).toBe('auto');
	});

	it('prefers operator-capable search engines for operator queries', () => {
		const decision = select_provider({
			tool: 'web_search',
			provider: 'auto',
			query: 'sveltekit docs filetype:pdf site:docs.svelte.dev',
			candidates: web_search_candidates,
		});

		expect(decision.provider).toBe('brave');
		expect(decision.signals).toEqual(
			expect.arrayContaining(['operators', 'docs_code']),
		);
	});

	it('prefers exa for semantic discovery queries', () => {
		const decision = select_provider({
			tool: 'web_search',
			query: 'similar research papers about transformers',
			candidates: web_search_candidates,
		});

		expect(decision.provider).toBe('exa');
	});

	it('breaks equal scores with the documented priority list', () => {
		const decision = select_provider({
			tool: 'web_search',
			query: 'latest news today about the fed',
			candidates: [
				{ name: 'tavily' },
				{ name: 'brave' },
				{ name: 'exa' },
			],
		});

		expect(decision.provider).toBe('tavily');
		expect(WEB_SEARCH_PRIORITY[0]).toBe('tavily');
	});

	it('only scores configured providers', () => {
		const decision = select_provider({
			tool: 'web_search',
			query: 'similar research papers about transformers',
			candidates: [{ name: 'tavily' }, { name: 'brave' }],
		});

		expect(decision.provider).toBe('tavily');
		expect(decision.scores.map((score) => score.name)).toEqual([
			'tavily',
			'brave',
		]);
	});

	it('does not pick kagi_enrichment for generic queries', () => {
		const decision = select_provider({
			tool: 'web_search',
			query: 'weather in berlin',
			candidates: web_search_candidates,
		});

		expect(decision.provider).not.toBe('kagi_enrichment');
	});

	it('selects kagi_enrichment when it is the only configured provider', () => {
		const decision = select_provider({
			tool: 'web_search',
			query: 'weather in berlin',
			candidates: [{ name: 'kagi_enrichment' }],
		});

		expect(decision.provider).toBe('kagi_enrichment');
	});

	it('fails visibly when no provider is eligible', () => {
		expect(() =>
			select_provider({
				tool: 'web_search',
				query: 'anything',
				candidates: [],
			}),
		).toThrow(ProviderError);

		try {
			select_provider({
				tool: 'web_search',
				query: 'anything',
				candidates: [],
			});
		} catch (error) {
			expect(error).toMatchObject({
				type: ErrorType.INVALID_INPUT,
				provider: 'web_search',
			});
			expect((error as ProviderError).message).toMatch(
				/no eligible provider/i,
			);
		}
	});

	it('fails visibly when extract mode has no configured provider', () => {
		expect(() =>
			select_provider({
				tool: 'web_extract',
				url: 'https://example.com',
				mode: 'crawl',
				candidates: [{ name: 'tavily', modes: ['extract'] }],
			}),
		).toThrow(
			expect.objectContaining({
				type: ErrorType.INVALID_INPUT,
				provider: 'web_extract',
			}),
		);
	});

	it('routes youtube URLs to kagi when configured', () => {
		const decision = select_provider({
			tool: 'web_extract',
			url: 'https://www.youtube.com/watch?v=abc',
			candidates: web_extract_candidates,
		});

		expect(decision.provider).toBe('kagi');
		expect(WEB_EXTRACT_PRIORITY).toContain('kagi');
	});

	it('routes documentation URLs to firecrawl when configured', () => {
		const decision = select_provider({
			tool: 'web_extract',
			url: 'https://docs.python.org/3/library/os.html',
			candidates: web_extract_candidates,
		});

		expect(decision.provider).toBe('firecrawl');
	});

	it('picks tavily for generic extraction by priority', () => {
		const decision = select_provider({
			tool: 'web_extract',
			url: 'https://example.com/long-article',
			candidates: web_extract_candidates,
		});

		expect(decision.provider).toBe('tavily');
	});

	it('routes deep AI queries to linkup and semantic ones to exa_answer', () => {
		expect(
			select_provider({
				tool: 'ai_search',
				query: 'deep comprehensive research on climate policy',
				candidates: ai_search_candidates,
			}).provider,
		).toBe('linkup');

		expect(
			select_provider({
				tool: 'ai_search',
				query: 'similar concepts to attention mechanism',
				candidates: ai_search_candidates,
			}).provider,
		).toBe('exa_answer');

		expect(
			select_provider({
				tool: 'ai_search',
				query: 'what is REST',
				candidates: ai_search_candidates,
			}).provider,
		).toBe('kagi_fastgpt');
	});

	it('never fans out: one requested provider yields one winner', () => {
		const decision = select_provider({
			tool: 'web_search',
			query: 'latest news and similar papers site:arxiv.org',
			candidates: web_search_candidates,
		});

		expect(typeof decision.provider).toBe('string');
		expect(decision.provider.includes(',')).toBe(false);
		expect(
			web_search_candidates.filter(
				(candidate) => candidate.name === decision.provider,
			),
		).toHaveLength(1);
	});
});
