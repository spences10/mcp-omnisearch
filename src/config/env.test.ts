import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	should_warn_for_local_file_offload,
	validate_config,
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

describe('validate_config MCP backends', () => {
	afterEach(() => {
		delete process.env.OMNISEARCH_MCP_BACKENDS;
		vi.restoreAllMocks();
	});

	it('fails startup when OMNISEARCH_MCP_BACKENDS is invalid', () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		process.env.OMNISEARCH_MCP_BACKENDS = '{';

		expect(() => validate_config()).toThrow(
			/OMNISEARCH_MCP_BACKENDS: must be valid JSON/,
		);
	});
});
