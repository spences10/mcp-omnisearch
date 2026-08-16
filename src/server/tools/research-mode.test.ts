import { describe, expect, it } from 'vitest';
import {
	ErrorType,
	ProviderError,
	type SearchResult,
} from '../../common/types.js';
import {
	DEFAULT_RESEARCH_TIME_BUDGET_SECONDS,
	dedupe_search_results,
	normalize_result_url,
	run_research_mode,
	select_research_extract_provider,
	select_research_search_providers,
	type ResearchClock,
	type ResearchExtractProvider,
	type ResearchSearchProvider,
} from './research-mode.js';

const result = (
	provider: string,
	path: string,
	title = provider,
): SearchResult => ({
	title,
	url: `https://example.com/${path}`,
	snippet: `${title} snippet`,
	source_provider: provider,
});

const search_provider = (
	id: string,
	search: ResearchSearchProvider['search'],
	capabilities: readonly string[] = ['web_search'],
): ResearchSearchProvider => ({
	id,
	capabilities,
	search,
});

const extract_provider = (
	id: string,
	process_content: ResearchExtractProvider['process_content'],
): ResearchExtractProvider => ({
	id,
	name: id.split(':')[0] ?? id,
	modes: [id.split(':')[1] ?? 'extract'],
	process_content,
});

const immediate_clock = (): ResearchClock => ({
	now: () => 0,
	timeout: async (promise) => promise,
});

describe('research mode helpers', () => {
	it('normalizes URLs for cross-provider dedupe', () => {
		expect(
			normalize_result_url('https://www.Example.com/docs/#top'),
		).toBe('https://example.com/docs');
		expect(normalize_result_url('not a url')).toBe('not a url');
	});

	it('keeps first-seen URLs and honors the result limit', () => {
		expect(
			dedupe_search_results(
				[
					result('brave', 'a'),
					result('tavily', 'a'),
					result('kagi', 'b'),
					result('exa', 'c'),
				],
				2,
			),
		).toEqual([result('brave', 'a'), result('kagi', 'b')]);
	});

	it('prefers the requested provider and web_search-capable peers', () => {
		const selected = select_research_search_providers(
			[
				search_provider('tavily', async () => []),
				search_provider('brave', async () => []),
				search_provider('kagi', async () => []),
				search_provider('exa', async () => []),
				search_provider('kagi_enrichment', async () => [], [
					'specialized_indexes',
				]),
			],
			'brave',
		).map((provider) => provider.id);

		expect(selected).toEqual(['brave', 'tavily', 'kagi', 'exa']);
	});

	it('includes a specialized preferred provider without filling from it', () => {
		const selected = select_research_search_providers(
			[
				search_provider('brave', async () => []),
				search_provider('kagi_enrichment', async () => [], [
					'specialized_indexes',
				]),
			],
			'kagi_enrichment',
		).map((provider) => provider.id);

		expect(selected).toEqual(['kagi_enrichment', 'brave']);
	});

	it('picks extract providers in documented preference order', () => {
		expect(
			select_research_extract_provider([
				{ id: 'kagi:summarize' },
				{ id: 'firecrawl:scrape' },
				{ id: 'tavily:extract' },
			])?.id,
		).toBe('tavily:extract');
		expect(
			select_research_extract_provider([{ id: 'exa:similar' }]),
		).toBeUndefined();
	});
});

describe('run_research_mode', () => {
	it('fans out to several providers and returns partial results', async () => {
		const payload = await run_research_mode(
			{
				query: 'sveltekit',
				preferred_provider: 'brave',
				extract: false,
				clock: immediate_clock(),
			},
			[
				search_provider('brave', async () => [result('brave', 'a')]),
				search_provider('tavily', async () => {
					throw new Error('tavily down');
				}),
			],
		);

		expect(payload.mode).toBe('research');
		expect(payload.results).toEqual([result('brave', 'a')]);
		expect(payload.research.selected).toEqual(['brave', 'tavily']);
		expect(payload.research.succeeded).toEqual(['brave']);
		expect(payload.research.failed).toEqual([
			{ provider: 'tavily', error: 'tavily down' },
		]);
		expect(payload.research.extract.status).toBe('skipped');
		expect(payload.research.extract.reason).toBe('disabled');
		expect(payload.research.time_budget_seconds).toBe(
			DEFAULT_RESEARCH_TIME_BUDGET_SECONDS,
		);
	});

	it('stops waiting after two diverse contributors and labels the rest', async () => {
		let slow_started = false;
		const payload = await run_research_mode(
			{
				query: 'docs',
				preferred_provider: 'brave',
				extract: false,
				clock: immediate_clock(),
			},
			[
				search_provider('brave', async () => [result('brave', 'a')]),
				search_provider('tavily', async () => [
					result('tavily', 'b'),
				]),
				search_provider('kagi', async () => {
					slow_started = true;
					return new Promise(() => {});
				}),
			],
		);

		expect(slow_started).toBe(true);
		expect(payload.research.succeeded).toEqual(['brave', 'tavily']);
		expect(payload.research.skipped).toEqual([
			{ provider: 'kagi', reason: 'early_stop' },
		]);
	});

	it('skips later launches and extract when the budget is already exhausted', async () => {
		let now = 2_000;
		const clock: ResearchClock = {
			now: () => now,
			timeout: async (promise) => promise,
		};
		const payload = await run_research_mode(
			{
				query: 'budget',
				preferred_provider: 'brave',
				time_budget_seconds: 1,
				clock,
				extract: true,
			},
			[
				search_provider('brave', async () => {
					now = 3_000;
					return [result('brave', 'a')];
				}),
				search_provider('tavily', async () => {
					throw new Error('should not launch');
				}),
			],
			extract_provider('tavily:extract', async () => {
				throw new Error('should not extract');
			}),
		);

		expect(payload.results).toEqual([result('brave', 'a')]);
		expect(payload.research.skipped).toEqual([
			{ provider: 'tavily', reason: 'time_budget_exhausted' },
		]);
		expect(payload.research.extract).toEqual(
			expect.objectContaining({
				status: 'skipped',
				reason: 'time_budget_exhausted',
				provider: 'tavily:extract',
			}),
		);
	});

	it('extracts top URLs and keeps search results when extract fails', async () => {
		const extracted = await run_research_mode(
			{
				query: 'extract',
				preferred_provider: 'brave',
				extract_count: 1,
				clock: immediate_clock(),
			},
			[
				search_provider('brave', async () => [
					result('brave', 'a'),
					result('brave', 'b'),
				]),
			],
			extract_provider('tavily:extract', async (urls) => ({
				content: `extracted ${Array.isArray(urls) ? urls.join(',') : urls}`,
				source_provider: 'tavily_extract',
				metadata: { urls_processed: 1 },
			})),
		);

		expect(extracted.extracts?.content).toBe(
			'extracted https://example.com/a',
		);
		expect(extracted.research.extract.status).toBe('succeeded');
		expect(extracted.research.extract.urls).toEqual([
			'https://example.com/a',
		]);

		const failed = await run_research_mode(
			{
				query: 'extract',
				preferred_provider: 'brave',
				clock: immediate_clock(),
			},
			[search_provider('brave', async () => [result('brave', 'a')])],
			extract_provider('tavily:extract', async () => {
				throw new Error('extract exploded');
			}),
		);

		expect(failed.results).toEqual([result('brave', 'a')]);
		expect(failed.extracts).toBeUndefined();
		expect(failed.research.extract).toEqual(
			expect.objectContaining({
				status: 'failed',
				error: 'extract exploded',
			}),
		);
	});

	it('labels extract timeouts and missing extract providers', async () => {
		let timeout_calls = 0;
		const timed_out = await run_research_mode(
			{
				query: 'timeout',
				preferred_provider: 'brave',
				clock: {
					now: () => 0,
					timeout: async (promise, _ms, error) => {
						timeout_calls += 1;
						if (timeout_calls === 1) return promise;
						throw error;
					},
				},
			},
			[search_provider('brave', async () => [result('brave', 'a')])],
			extract_provider(
				'tavily:extract',
				async () => new Promise(() => {}),
			),
		);

		expect(timed_out.results).toEqual([result('brave', 'a')]);
		expect(timed_out.research.extract.status).toBe('timed_out');

		const missing = await run_research_mode(
			{
				query: 'no-extract',
				preferred_provider: 'brave',
				clock: immediate_clock(),
			},
			[search_provider('brave', async () => [result('brave', 'a')])],
		);

		expect(missing.research.extract.reason).toBe(
			'no_extract_provider',
		);
	});

	it('keeps an empty research payload when every search provider fails', async () => {
		const payload = await run_research_mode(
			{
				query: 'none',
				preferred_provider: 'brave',
				clock: immediate_clock(),
			},
			[
				search_provider('brave', async () => {
					throw new ProviderError(
						ErrorType.API_ERROR,
						'nope',
						'brave',
					);
				}),
			],
		);

		expect(payload.results).toEqual([]);
		expect(payload.research.failed).toEqual([
			{ provider: 'brave', error: 'nope' },
		]);
		expect(payload.research.extract.reason).toBe('no_urls');
	});

	it('throws when no search providers can be selected', async () => {
		await expect(
			run_research_mode({ query: 'empty' }, []),
		).rejects.toMatchObject({
			type: ErrorType.INVALID_INPUT,
			provider: 'web_search',
		});
	});
});
