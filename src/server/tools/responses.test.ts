import { afterEach, describe, expect, it } from 'vitest';
import { ErrorType, ProviderError } from '../../common/types.js';
import { build_quality_report } from './quality-report.js';
import {
	create_error_tool_response,
	create_json_tool_response,
	handle_tool_result,
} from './responses.js';

const original_large_result_mode =
	process.env.OMNISEARCH_LARGE_RESULT_MODE;

afterEach(() => {
	if (original_large_result_mode === undefined) {
		delete process.env.OMNISEARCH_LARGE_RESULT_MODE;
	} else {
		process.env.OMNISEARCH_LARGE_RESULT_MODE =
			original_large_result_mode;
	}
});

describe('tool responses', () => {
	it('serializes successful JSON responses', () => {
		expect(create_json_tool_response({ ok: true })).toEqual({
			content: [
				{
					type: 'text',
					text: JSON.stringify({ ok: true }, null, 2),
				},
			],
		});
	});

	it('serializes ProviderError responses', () => {
		const response = create_error_tool_response(
			new ProviderError(
				ErrorType.INVALID_INPUT,
				'bad query',
				'web_search',
			),
		);

		expect(response).toEqual({
			content: [
				{
					type: 'text',
					text: JSON.stringify(
						{
							error: 'bad query',
							type: ErrorType.INVALID_INPUT,
							provider: 'web_search',
							retryable: false,
						},
						null,
						2,
					),
				},
			],
			isError: true,
		});
	});

	it('wraps successful tool results with large-result handling', async () => {
		await expect(
			handle_tool_result('web_search', async () => [{ title: 'ok' }]),
		).resolves.toEqual({
			content: [
				{
					type: 'text',
					text: JSON.stringify([{ title: 'ok' }], null, 2),
				},
			],
		});
	});

	it('passes per-request large result mode through to large-result handling', async () => {
		process.env.OMNISEARCH_LARGE_RESULT_MODE = 'file';
		const result = {
			content: 'x'.repeat(90000),
			source_provider: 'test',
		};

		const response = await handle_tool_result(
			'web_search',
			async () => result,
			{ large_result_mode: 'inline' },
		);

		expect(response).toEqual({
			content: [
				{
					type: 'text',
					text: JSON.stringify(result, null, 2),
				},
			],
		});
	});

	it('attaches an opt-in quality report after large-result handling', async () => {
		const results = [
			{
				title: 'ok',
				url: 'https://example.com',
				snippet: 'short',
			},
		];
		const report = build_quality_report({
			selected_provider: 'brave',
			selection_reason: 'explicit',
			results,
		});

		await expect(
			handle_tool_result('web_search', async () => results, {
				quality_report: (raw) =>
					build_quality_report({
						selected_provider: 'brave',
						selection_reason: 'explicit',
						results: raw,
					}),
			}),
		).resolves.toEqual({
			content: [
				{
					type: 'text',
					text: JSON.stringify(
						{ results, quality_report: report },
						null,
						2,
					),
				},
			],
		});
	});

	it('attaches a sanitized quality report on errors when requested', async () => {
		const report = build_quality_report({
			selected_provider: 'brave',
			selection_reason: 'explicit',
		});
		await expect(
			handle_tool_result(
				'web_search',
				async () => {
					throw new Error('vendor body {"secret":"nope"}');
				},
				{
					quality_report: () => report,
				},
			),
		).resolves.toEqual({
			content: [
				{
					type: 'text',
					text: JSON.stringify(
						{
							error:
								'Unexpected error: vendor body {"secret":"nope"}',
							type: ErrorType.API_ERROR,
							retryable: false,
							quality_report: report,
						},
						null,
						2,
					),
				},
			],
			isError: true,
		});
		expect(JSON.stringify(report)).not.toContain('nope');
	});

	it('wraps thrown errors as MCP error responses', async () => {
		await expect(
			handle_tool_result('web_search', async () => {
				throw new Error('boom');
			}),
		).resolves.toEqual({
			content: [
				{
					type: 'text',
					text: JSON.stringify(
						{
							error: 'Unexpected error: boom',
							type: ErrorType.API_ERROR,
							retryable: false,
						},
						null,
						2,
					),
				},
			],
			isError: true,
		});
	});
});
