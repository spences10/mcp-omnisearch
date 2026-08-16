import { describe, expect, it, vi } from 'vitest';
import {
	is_adaptive_routing_enabled,
	should_warn_for_local_file_offload,
	warn_for_local_file_offload,
} from './env.js';

describe('adaptive routing config', () => {
	it('defaults to on and can be disabled', () => {
		expect(is_adaptive_routing_enabled({})).toBe(true);
		expect(
			is_adaptive_routing_enabled({
				OMNISEARCH_ADAPTIVE_ROUTING: 'on',
			}),
		).toBe(true);
		expect(
			is_adaptive_routing_enabled({
				OMNISEARCH_ADAPTIVE_ROUTING: 'off',
			}),
		).toBe(false);
		expect(
			is_adaptive_routing_enabled({
				OMNISEARCH_ADAPTIVE_ROUTING: 'false',
			}),
		).toBe(false);
		expect(
			is_adaptive_routing_enabled({
				OMNISEARCH_ADAPTIVE_ROUTING: '0',
			}),
		).toBe(false);
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
