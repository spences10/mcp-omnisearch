import { describe, expect, it, vi } from 'vitest';
import {
	keenable_registration_key,
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

describe('keenable_registration_key', () => {
	it('prefers a real key over the public tier', () => {
		expect(keenable_registration_key('keen_test', true)).toBe(
			'keen_test',
		);
	});

	it('uses a public sentinel only when the public tier is opted in', () => {
		expect(keenable_registration_key(undefined, true)).toBe('public');
		expect(
			keenable_registration_key(undefined, false),
		).toBeUndefined();
		expect(keenable_registration_key('  ', false)).toBeUndefined();
	});
});
