import { readFileSync, rmSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	handle_large_result,
	type LargeResultResponse,
} from './results.js';

const created_files: string[] = [];
const large_result = {
	ok: true,
	value: 'x'.repeat(90_000),
	output: [],
	calls: [],
	storeWrites: { set: {}, delete: [] },
};

afterEach(() => {
	for (const file of created_files.splice(0))
		rmSync(file, { force: true });
	vi.unstubAllEnvs();
});

describe('final execution results', () => {
	it('returns safely sized envelopes unchanged', () => {
		const result = {
			ok: true,
			value: { url: 'https://example.com' },
			output: [],
			calls: [],
		};
		expect(handle_large_result(result, 'codemode')).toBe(result);
	});

	it.each([undefined, 'file', 'invalid'])(
		'offloads the complete envelope as JSON in %s mode',
		(mode) => {
			vi.stubEnv('OMNISEARCH_LARGE_RESULT_MODE', mode);
			const handled = handle_large_result(
				large_result,
				'codemode',
			) as LargeResultResponse;
			created_files.push(handled.file_path);
			const json = readFileSync(handled.file_path, 'utf8');
			expect(JSON.parse(json)).toEqual(large_result);
			expect(handled.file_path).toContain('mcp-codemode-');
			expect(handled.total_lines).toBe(json.split('\n').length);
			expect(handled.estimated_tokens).toBeGreaterThan(20_000);
			expect(handled.read_hint).toContain(handled.file_path);
		},
	);

	it('returns large envelopes inline when configured', () => {
		vi.stubEnv('OMNISEARCH_LARGE_RESULT_MODE', 'inline');
		expect(handle_large_result(large_result, 'codemode')).toBe(
			large_result,
		);
	});

	it('lets per-request inline override file mode', () => {
		vi.stubEnv('OMNISEARCH_LARGE_RESULT_MODE', 'file');
		expect(
			handle_large_result(large_result, 'codemode', {
				mode: 'inline',
			}),
		).toBe(large_result);
	});

	it('lets per-request file mode override inline mode', () => {
		vi.stubEnv('OMNISEARCH_LARGE_RESULT_MODE', 'inline');
		const handled = handle_large_result(large_result, 'codemode', {
			mode: 'file',
		}) as LargeResultResponse;
		created_files.push(handled.file_path);
		expect(
			JSON.parse(readFileSync(handled.file_path, 'utf8')),
		).toEqual(large_result);
	});
});
