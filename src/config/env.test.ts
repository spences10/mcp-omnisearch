import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	should_warn_for_local_file_offload,
	validate_config,
	warn_for_local_file_offload,
} from './env.js';

afterEach(() => {
	vi.unstubAllEnvs();
	vi.restoreAllMocks();
});

describe('provider availability logging', () => {
	it.each([undefined, '  ', 'test-only-value'])(
		'reports key names without exposing values for %s',
		(value) => {
			for (const name of [
				'TAVILY_API_KEY',
				'BRAVE_API_KEY',
				'KAGI_API_KEY',
				'GITHUB_API_KEY',
				'FIRECRAWL_API_KEY',
				'EXA_API_KEY',
				'LINKUP_API_KEY',
				'OMNISEARCH_LARGE_RESULT_MODE',
			])
				vi.stubEnv(name, undefined);
			vi.stubEnv('TAVILY_API_KEY', value);
			const error = vi
				.spyOn(console, 'error')
				.mockImplementation(() => {});
			const warn = vi
				.spyOn(console, 'warn')
				.mockImplementation(() => {});
			validate_config();
			if (value?.trim())
				expect(error).toHaveBeenCalledWith(
					'Found API keys for: TAVILY_API_KEY',
				);
			else
				expect(error).toHaveBeenCalledWith(
					expect.stringContaining('No API keys found'),
				);
			expect(warn).toHaveBeenCalledWith(
				expect.stringContaining('BRAVE_API_KEY'),
			);
			expect(
				JSON.stringify([error.mock.calls, warn.mock.calls]),
			).not.toContain('test-only-value');
		},
	);
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
