import { describe, expect, it } from 'vitest';
import {
	apply_search_quality,
	domain_matches_rule,
	extract_domain_constraints,
	filter_spam_results,
	hostname_from_url,
	registrable_domain,
	rerank_domain_diversity,
} from './quality.js';

const result = (url: string, title = 't') => ({
	title,
	url,
	snippet: 'snippet text',
	source_provider: 'brave',
});

describe('hostname helpers', () => {
	it('strips www and ignores invalid URLs', () => {
		expect(hostname_from_url('https://www.NewBedev.com/x')).toBe(
			'newbedev.com',
		);
		expect(hostname_from_url('not-a-url')).toBe('');
	});

	it('uses eTLD+1 so subdomains share a registrable domain', () => {
		expect(registrable_domain('blog.example.com')).toBe(
			'example.com',
		);
		expect(registrable_domain('docs.example.co.uk')).toBe(
			'example.co.uk',
		);
		expect(registrable_domain('user.github.io')).toBe(
			'user.github.io',
		);
		expect(registrable_domain('a.example')).toBe('a.example');
	});

	it('matches exact domains and true subdomains only', () => {
		expect(
			domain_matches_rule('de.newbedev.com', 'newbedev.com'),
		).toBe(true);
		expect(
			domain_matches_rule(
				'newbedev.com.evil.example',
				'newbedev.com',
			),
		).toBe(false);
		expect(
			domain_matches_rule('newbedev.community', 'newbedev.com'),
		).toBe(false);
	});
});

describe('filter_spam_results', () => {
	it('removes known mirror domains', () => {
		const { kept, removed } = filter_spam_results([
			result('https://stackoverflow.com/q/1'),
			result('https://newbedev.com/some-copied-answer'),
			result('https://githubmemory.com/repo/issue'),
		]);

		expect(kept.map((item) => item.url)).toEqual([
			'https://stackoverflow.com/q/1',
		]);
		expect(removed).toEqual(['githubmemory.com', 'newbedev.com']);
	});

	it('matches www and subdomains', () => {
		const { kept, removed } = filter_spam_results([
			result('https://www.newbedev.com/x'),
			result('https://de.newbedev.com/x'),
		]);

		expect(kept).toEqual([]);
		expect(removed).toEqual(['de.newbedev.com', 'newbedev.com']);
	});

	it('does not treat lookalike registrations as blocked', () => {
		const { kept, removed } = filter_spam_results([
			result('https://newbedev.com.evil.example/post'),
			result('https://newbedev.community/post'),
		]);

		expect(kept.map((item) => item.url)).toEqual([
			'https://newbedev.com.evil.example/post',
			'https://newbedev.community/post',
		]);
		expect(removed).toEqual([]);
	});

	it('covers live-sighted documentation mirrors', () => {
		const { kept, removed } = filter_spam_results([
			result('https://fixmycodeerror.com/q'),
			result('https://stacklesson.com/q'),
			result('https://docs.w3cub.com/python~3/library/ssl'),
		]);

		expect(kept).toEqual([]);
		expect(removed).toEqual([
			'docs.w3cub.com',
			'fixmycodeerror.com',
			'stacklesson.com',
		]);
	});

	it('accepts extra blocked domains and allowlist rescues', () => {
		expect(
			filter_spam_results(
				[result('https://content-farm.example/post')],
				['content-farm.example'],
			).removed,
		).toEqual(['content-farm.example']);

		const rescued = filter_spam_results(
			[result('https://newbedev.com/x')],
			[],
			['newbedev.com'],
		);
		expect(rescued.kept).toHaveLength(1);
		expect(rescued.removed).toEqual([]);
	});

	it('passes clean results through unchanged', () => {
		const results = [
			result('https://docs.python.org/3/'),
			result('https://github.com/x/y'),
		];

		expect(filter_spam_results(results)).toEqual({
			kept: results,
			removed: [],
		});
	});
});

describe('rerank_domain_diversity', () => {
	it('demotes overflow results from the same registrable domain', () => {
		const { results, demoted } = rerank_domain_diversity(
			[
				result('https://a.example/1'),
				result('https://a.example/2'),
				result('https://a.example/3'),
				result('https://b.example/1'),
			],
			2,
		);

		expect(results.map((item) => item.url)).toEqual([
			'https://a.example/1',
			'https://a.example/2',
			'https://b.example/1',
			'https://a.example/3',
		]);
		expect(demoted).toBe(1);
	});

	it('caps subdomains of one registrable domain together', () => {
		const { results, demoted } = rerank_domain_diversity(
			[
				result('https://blog.example.com/1'),
				result('https://docs.example.com/2'),
				result('https://www.example.com/3'),
				result('https://other.example/1'),
			],
			2,
		);

		expect(results.map((item) => item.url)).toEqual([
			'https://blog.example.com/1',
			'https://docs.example.com/2',
			'https://other.example/1',
			'https://www.example.com/3',
		]);
		expect(demoted).toBe(1);
	});

	it('leaves short or already-diverse lists untouched', () => {
		const short_list = [
			result('https://a.example/1'),
			result('https://a.example/2'),
		];
		expect(rerank_domain_diversity(short_list, 1)).toEqual({
			results: short_list,
			demoted: 0,
		});

		const diverse = [
			result('https://a.example/1'),
			result('https://b.example/1'),
			result('https://c.example/1'),
		];
		expect(rerank_domain_diversity(diverse)).toEqual({
			results: diverse,
			demoted: 0,
		});
	});
});

describe('extract_domain_constraints', () => {
	it('collects site operators and include_domains', () => {
		expect(
			extract_domain_constraints(
				'site:github.com site:Docs.Python.org asyncio',
				['arxiv.org'],
			),
		).toEqual(['arxiv.org', 'docs.python.org', 'github.com']);
	});

	it('returns no constraints for plain queries', () => {
		expect(
			extract_domain_constraints('fastapi upload file example'),
		).toEqual([]);
		expect(extract_domain_constraints('', undefined)).toEqual([]);
	});
});

describe('apply_search_quality', () => {
	it('filters mirrors and reports spam_filtered metadata', () => {
		const output = apply_search_quality([
			result('https://stackoverflow.com/q/1'),
			result('https://newbedev.com/copy'),
			result('https://docs.python.org/3/'),
		]);

		expect(output.results.map((item) => item.url)).toEqual([
			'https://stackoverflow.com/q/1',
			'https://docs.python.org/3/',
		]);
		expect(output.metadata.spam_filtered).toEqual({
			removed_count: 1,
			domains: ['newbedev.com'],
			demoted_count: 0,
		});
	});

	it('applies the per-domain cap and reports demotions', () => {
		const output = apply_search_quality([
			result('https://a.example/1'),
			result('https://a.example/2'),
			result('https://a.example/3'),
			result('https://b.example/1'),
		]);

		expect(
			output.results.map((item) => item.url).slice(0, 3),
		).toEqual([
			'https://a.example/1',
			'https://a.example/2',
			'https://b.example/1',
		]);
		expect(output.metadata.spam_filtered.demoted_count).toBe(1);
	});

	it('can disable spam filtering and the domain cap', () => {
		const spam = apply_search_quality(
			[result('https://newbedev.com/copy')],
			{ filter_spam: false },
		);
		expect(spam.results).toHaveLength(1);
		expect(spam.metadata.spam_filtered.removed_count).toBe(0);

		const crowded = [
			result('https://a.example/1'),
			result('https://a.example/2'),
			result('https://a.example/3'),
		];
		const uncapped = apply_search_quality(crowded, {
			max_results_per_domain: 0,
		});
		expect(uncapped.results.map((item) => item.url)).toEqual(
			crowded.map((item) => item.url),
		);
	});

	it('rescues allowlisted domains from the blocklist', () => {
		const output = apply_search_quality(
			[result('https://newbedev.com/copy')],
			{ allowed_domains: ['newbedev.com'] },
		);

		expect(output.results).toHaveLength(1);
	});

	it('skips diversity rerank for site: and include_domains', () => {
		const github = [
			result('https://github.com/x/1'),
			result('https://github.com/x/2'),
			result('https://github.com/x/3'),
			result('https://randomblog.example/post'),
		];
		const site_query = apply_search_quality(github, {
			query: 'site:github.com fastapi upload example',
		});
		expect(site_query.results.map((item) => item.url)).toEqual(
			github.map((item) => item.url),
		);
		expect(site_query.metadata.spam_filtered.demoted_count).toBe(0);

		const arxiv = [
			result('https://arxiv.org/abs/1'),
			result('https://arxiv.org/abs/2'),
			result('https://arxiv.org/abs/3'),
			result('https://other.example/x'),
		];
		const included = apply_search_quality(arxiv, {
			query: 'attention is all you need',
			include_domains: ['arxiv.org'],
		});
		expect(
			included.results.map((item) => item.url).slice(0, 3),
		).toEqual([
			'https://arxiv.org/abs/1',
			'https://arxiv.org/abs/2',
			'https://arxiv.org/abs/3',
		]);
	});

	it('lets an explicit site: query keep a blocked domain', () => {
		const output = apply_search_quality(
			[result('https://newbedev.com/copy')],
			{ query: 'site:newbedev.com some query' },
		);

		expect(output.results).toHaveLength(1);
	});

	it('still reranks unconstrained queries', () => {
		const output = apply_search_quality(
			[
				result('https://a.example/1'),
				result('https://a.example/2'),
				result('https://a.example/3'),
				result('https://b.example/1'),
			],
			{ query: 'fastapi upload file example' },
		);

		expect(output.metadata.spam_filtered.demoted_count).toBe(1);
	});
});
