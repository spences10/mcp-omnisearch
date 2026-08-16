import { afterEach, describe, expect, it } from 'vitest';
import {
	build_search_cache_key,
	cached_search,
	is_complete_search_outcome,
	is_search_cache_bypassed,
	reset_default_search_cache,
	SearchCache,
} from './search-cache.js';
import {
	DEFAULT_SEARCH_CACHE_TTL_MS,
	parse_search_cache_ttl_ms,
} from '../config/env.js';

afterEach(() => {
	reset_default_search_cache();
});

describe('build_search_cache_key', () => {
	it('normalizes query, provider, default limit, and domain order', () => {
		expect(
			build_search_cache_key({
				query: '  Foo   Bar ',
				provider: 'Brave',
			}),
		).toBe(
			build_search_cache_key({
				query: 'foo bar',
				provider: 'brave',
				limit: 10,
				include_domains: [],
				exclude_domains: [],
			}),
		);

		expect(
			build_search_cache_key({
				query: 'q',
				provider: 'brave',
				include_domains: ['B.com', 'a.com'],
				exclude_domains: ['Ads.example', 'spam.test'],
			}),
		).toBe(
			build_search_cache_key({
				query: 'q',
				provider: 'brave',
				include_domains: ['a.com', 'b.com'],
				exclude_domains: ['spam.test', 'ads.example'],
			}),
		);
	});

	it('changes the key when provider, limit, or filters differ', () => {
		const base = {
			query: 'sveltekit',
			provider: 'brave',
			limit: 5,
		};

		expect(build_search_cache_key(base)).not.toBe(
			build_search_cache_key({ ...base, provider: 'tavily' }),
		);
		expect(build_search_cache_key(base)).not.toBe(
			build_search_cache_key({ ...base, limit: 10 }),
		);
		expect(build_search_cache_key(base)).not.toBe(
			build_search_cache_key({
				...base,
				include_domains: ['svelte.dev'],
			}),
		);
		expect(build_search_cache_key(base)).not.toBe(
			build_search_cache_key({
				...base,
				filters: { freshness: 'week' },
			}),
		);
	});
});

describe('SearchCache', () => {
	it('returns a cloned hit within TTL and misses after expiry', () => {
		let now = 1_000;
		const cache = new SearchCache<{ title: string }[]>({
			ttl_ms: 1_000,
			now: () => now,
		});
		const stored = [{ title: 'Example' }];

		expect(cache.set('k', stored)).toBe(true);
		stored[0].title = 'mutated';

		const hit = cache.get('k');
		expect(hit).toEqual([{ title: 'Example' }]);
		if (hit) hit[0].title = 'caller-mutated';
		expect(cache.get('k')).toEqual([{ title: 'Example' }]);

		now = 2_001;
		expect(cache.get('k')).toBeUndefined();
	});

	it('does not store incomplete multi-provider results as complete', () => {
		const cache = new SearchCache();
		const partial = [{ title: 'partial', url: 'https://x.test' }];

		expect(
			is_complete_search_outcome({
				failed_providers: ['exa'],
			}),
		).toBe(false);
		expect(
			is_complete_search_outcome({
				selected_providers: ['brave', 'exa'],
				succeeded_providers: ['brave'],
			}),
		).toBe(false);
		expect(
			is_complete_search_outcome({
				failed_providers: [],
				complete: true,
			}),
		).toBe(true);
		expect(is_complete_search_outcome()).toBe(true);

		expect(cache.set('partial', partial, { complete: false })).toBe(
			false,
		);
		expect(cache.get('partial')).toBeUndefined();
	});

	it('treats cache write failures as non-fatal', () => {
		const cache = new SearchCache({
			store: {
				get: () => {
					throw new Error('read failed');
				},
				set: () => {
					throw new Error('disk full');
				},
			},
		});

		expect(cache.set('k', [{ title: 'x' }])).toBe(false);
		expect(cache.get('k')).toBeUndefined();
	});
});

describe('cached_search', () => {
	it('reuses complete results and honors no_cache plus env bypass', async () => {
		const cache = new SearchCache<string>();
		let calls = 0;
		const load = async () => {
			calls += 1;
			return `result-${calls}`;
		};
		const key = { query: 'Example Query', provider: 'Brave' };

		expect(await cached_search(key, load, { cache })).toBe(
			'result-1',
		);
		expect(
			await cached_search(
				{ query: 'example query', provider: 'brave' },
				load,
				{ cache },
			),
		).toBe('result-1');
		expect(calls).toBe(1);

		expect(
			await cached_search(key, load, { cache, no_cache: true }),
		).toBe('result-2');
		expect(calls).toBe(2);

		expect(
			is_search_cache_bypassed(false, {
				OMNISEARCH_NO_CACHE: 'true',
			}),
		).toBe(true);
		expect(
			await cached_search(key, load, {
				cache,
				env: { OMNISEARCH_NO_CACHE: '1' },
			}),
		).toBe('result-3');
		expect(calls).toBe(3);
	});

	it('does not cache a partial multi-provider load as a complete hit', async () => {
		const cache = new SearchCache<{
			results: string[];
			failed_providers: string[];
		}>();
		let calls = 0;
		const load = async () => {
			calls += 1;
			return {
				results: ['brave-hit'],
				failed_providers: ['exa'],
			};
		};

		const first = await cached_search(
			{ query: 'q', provider: 'multi' },
			load,
			{
				cache,
				complete: (value) => is_complete_search_outcome(value),
			},
		);
		const second = await cached_search(
			{ query: 'q', provider: 'multi' },
			load,
			{
				cache,
				complete: (value) => is_complete_search_outcome(value),
			},
		);

		expect(first.results).toEqual(['brave-hit']);
		expect(second.results).toEqual(['brave-hit']);
		expect(calls).toBe(2);
	});
});

describe('search cache env', () => {
	it('defaults TTL to one hour and accepts a valid override', () => {
		expect(parse_search_cache_ttl_ms({})).toBe(
			DEFAULT_SEARCH_CACHE_TTL_MS,
		);
		expect(DEFAULT_SEARCH_CACHE_TTL_MS).toBe(60 * 60 * 1000);
		expect(
			parse_search_cache_ttl_ms({
				OMNISEARCH_SEARCH_CACHE_TTL_MS: '120000',
			}),
		).toBe(120000);
		expect(
			parse_search_cache_ttl_ms({
				OMNISEARCH_SEARCH_CACHE_TTL_MS: 'nope',
			}),
		).toBe(DEFAULT_SEARCH_CACHE_TTL_MS);
		expect(
			parse_search_cache_ttl_ms({
				OMNISEARCH_SEARCH_CACHE_TTL_MS: '-1',
			}),
		).toBe(DEFAULT_SEARCH_CACHE_TTL_MS);
		expect(
			is_search_cache_bypassed(false, {
				OMNISEARCH_NO_CACHE: 'off',
			}),
		).toBe(false);
	});
});
