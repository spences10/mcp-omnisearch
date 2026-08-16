import { describe, expect, it } from 'vitest';
import {
	parse_bool_env,
	parse_name_list,
	provider_env_token,
	resolve_auto_allow,
} from './auto-allow.js';

describe('auto-allow env parsing', () => {
	it('parses comma-separated provider names', () => {
		expect(parse_name_list('parallel, Querit, ')).toEqual([
			'parallel',
			'querit',
		]);
		expect(parse_name_list(undefined)).toEqual([]);
	});

	it('parses boolean env tokens', () => {
		expect(parse_bool_env('true')).toBe(true);
		expect(parse_bool_env('ON')).toBe(true);
		expect(parse_bool_env('0')).toBe(false);
		expect(parse_bool_env('off')).toBe(false);
		expect(parse_bool_env('')).toBeUndefined();
		expect(parse_bool_env('maybe')).toBeUndefined();
	});

	it('normalizes provider ids into env tokens', () => {
		expect(provider_env_token('kagi_enrichment')).toBe(
			'KAGI_ENRICHMENT',
		);
		expect(provider_env_token('firecrawl:crawl')).toBe(
			'FIRECRAWL_CRAWL',
		);
	});
});

describe('resolve_auto_allow', () => {
	it('defaults current cheap engines to allowed', () => {
		expect(resolve_auto_allow('tavily', 'tavily', true, {})).toBe(
			true,
		);
		expect(resolve_auto_allow('exa', 'exa', undefined, {})).toBe(
			true,
		);
	});

	it('keeps declared expensive engines gated', () => {
		expect(
			resolve_auto_allow('parallel', 'parallel', false, {}),
		).toBe(false);
	});

	it('opts a gated provider in via OMNISEARCH_AUTO_ALLOW', () => {
		expect(
			resolve_auto_allow('parallel', 'parallel', false, {
				OMNISEARCH_AUTO_ALLOW: 'parallel,querit',
			}),
		).toBe(true);
	});

	it('opts a cheap provider out via OMNISEARCH_AUTO_DENY', () => {
		expect(
			resolve_auto_allow('exa', 'exa', true, {
				OMNISEARCH_AUTO_DENY: 'exa',
			}),
		).toBe(false);
	});

	it('lets allow-list win over deny-list', () => {
		expect(
			resolve_auto_allow('parallel', 'parallel', false, {
				OMNISEARCH_AUTO_ALLOW: 'parallel',
				OMNISEARCH_AUTO_DENY: 'parallel',
			}),
		).toBe(true);
	});

	it('lets per-provider env override lists and defaults', () => {
		expect(
			resolve_auto_allow('exa', 'exa', true, {
				OMNISEARCH_AUTO_ALLOW_EXA: 'false',
				OMNISEARCH_AUTO_ALLOW: 'exa',
			}),
		).toBe(false);
		expect(
			resolve_auto_allow('firecrawl:crawl', 'firecrawl', true, {
				OMNISEARCH_AUTO_ALLOW_FIRECRAWL_CRAWL: 'false',
			}),
		).toBe(false);
		expect(
			resolve_auto_allow('firecrawl:scrape', 'firecrawl', true, {
				OMNISEARCH_AUTO_ALLOW_FIRECRAWL: 'false',
			}),
		).toBe(false);
	});
});
