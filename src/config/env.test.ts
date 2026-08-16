import { describe, expect, it, vi } from 'vitest';
import {
	get_quality_settings,
	parse_boolean_env,
	parse_domain_list_env,
	parse_integer_env,
	should_warn_for_local_file_offload,
	warn_for_local_file_offload,
} from './env.js';

describe('large-result local file offload warnings', () => {
	it('warns when file mode is configured in likely remote deployments', () => {
		const warn = vi.fn();

		warn_for_local_file_offload(
			{
				OMNISEARCH_LARGE_RESULT_MODE: 'file',
				K_SERVICE: 'mcp-omnisearch',
			},
			warn,
		);

		expect(warn).toHaveBeenCalledWith(
			expect.stringContaining('OMNISEARCH_LARGE_RESULT_MODE=inline'),
		);
	});

	it('does not warn for inline mode in likely remote deployments', () => {
		expect(
			should_warn_for_local_file_offload({
				OMNISEARCH_LARGE_RESULT_MODE: 'inline',
				K_SERVICE: 'mcp-omnisearch',
			}),
		).toBe(false);
	});

	it('does not warn for file mode without remote deployment markers', () => {
		expect(
			should_warn_for_local_file_offload({
				OMNISEARCH_LARGE_RESULT_MODE: 'file',
			}),
		).toBe(false);
	});
});

describe('quality settings', () => {
	it('parses boolean, integer, and domain-list env values', () => {
		expect(parse_boolean_env(undefined, true)).toBe(true);
		expect(parse_boolean_env('false', true)).toBe(false);
		expect(parse_boolean_env('YES', false)).toBe(true);
		expect(parse_boolean_env('nope', true)).toBe(true);
		expect(parse_integer_env(undefined, 2)).toBe(2);
		expect(parse_integer_env('4', 2)).toBe(4);
		expect(parse_integer_env('nope', 2)).toBe(2);
		expect(
			parse_domain_list_env(' NewBedev.com, ,spam.dev '),
		).toEqual(['newbedev.com', 'spam.dev']);
	});

	it('defaults to conservative spam filtering and a domain cap of 2', () => {
		expect(get_quality_settings({})).toEqual({
			filter_spam: true,
			max_results_per_domain: 2,
			blocked_domains: [],
			allowed_domains: [],
		});
	});

	it('reads quality overrides from the environment', () => {
		expect(
			get_quality_settings({
				OMNISEARCH_FILTER_SPAM: '0',
				OMNISEARCH_MAX_RESULTS_PER_DOMAIN: '0',
				OMNISEARCH_BLOCKED_DOMAINS: 'spam.dev,mirror.example',
				OMNISEARCH_ALLOWED_DOMAINS: 'newbedev.com',
			}),
		).toEqual({
			filter_spam: false,
			max_results_per_domain: 0,
			blocked_domains: ['spam.dev', 'mirror.example'],
			allowed_domains: ['newbedev.com'],
		});
	});

	it('clamps the per-domain cap to 0-50', () => {
		expect(
			get_quality_settings({
				OMNISEARCH_MAX_RESULTS_PER_DOMAIN: '-3',
			}).max_results_per_domain,
		).toBe(0);
		expect(
			get_quality_settings({
				OMNISEARCH_MAX_RESULTS_PER_DOMAIN: '99',
			}).max_results_per_domain,
		).toBe(50);
	});
});
