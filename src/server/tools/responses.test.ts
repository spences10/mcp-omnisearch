import { describe, expect, it } from 'vitest';
import {
	create_error_tool_response,
	create_json_tool_response,
	handle_tool_result,
} from './responses.js';
import { ErrorType, ProviderError } from '../../common/types.js';

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
					text: 'web_search error: bad query',
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

	it('wraps thrown errors as MCP error responses', async () => {
		await expect(
			handle_tool_result('web_search', async () => {
				throw new Error('boom');
			}),
		).resolves.toEqual({
			content: [
				{
					type: 'text',
					text: 'Unexpected error: boom',
				},
			],
			isError: true,
		});
	});
});
