import { describe, expect, it, vi } from 'vitest';
import {
	DEFAULT_RRF_K,
	get_rrf_k,
	should_warn_for_local_file_offload,
	warn_for_local_file_offload,
} from './env.js';

describe('get_rrf_k', () => {
	it('defaults to the documented RRF constant of 60', () => {
		expect(DEFAULT_RRF_K).toBe(60);
		expect(get_rrf_k({})).toBe(60);
		expect(get_rrf_k({ OMNISEARCH_RRF_K: '   ' })).toBe(60);
	});

	it('reads a positive integer from OMNISEARCH_RRF_K', () => {
		expect(get_rrf_k({ OMNISEARCH_RRF_K: '40' })).toBe(40);
	});

	it('falls back to 60 for invalid OMNISEARCH_RRF_K values', () => {
		expect(get_rrf_k({ OMNISEARCH_RRF_K: '0' })).toBe(60);
		expect(get_rrf_k({ OMNISEARCH_RRF_K: '-1' })).toBe(60);
		expect(get_rrf_k({ OMNISEARCH_RRF_K: '60.5' })).toBe(60);
		expect(get_rrf_k({ OMNISEARCH_RRF_K: 'abc' })).toBe(60);
	});
});

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
