import { describe, expect, it, vi } from 'vitest';
import {
	DEFAULT_SEARCH_CACHE_TTL_MS,
	is_search_cache_disabled,
	parse_search_cache_ttl_ms,
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

describe('search cache environment', () => {
	it('parses TTL overrides and no_cache bypass flags', () => {
		expect(parse_search_cache_ttl_ms({})).toBe(
			DEFAULT_SEARCH_CACHE_TTL_MS,
		);
		expect(
			parse_search_cache_ttl_ms({
				OMNISEARCH_SEARCH_CACHE_TTL_MS: '0',
			}),
		).toBe(0);
		expect(
			is_search_cache_disabled({ OMNISEARCH_NO_CACHE: 'yes' }),
		).toBe(true);
		expect(
			is_search_cache_disabled({ OMNISEARCH_NO_CACHE: 'false' }),
		).toBe(false);
	});
});
