import { describe, expect, it } from 'vitest';
import { ErrorType } from './types.js';
import {
	extract_result_list,
	map_mcp_search_results,
	walk_result_path,
} from './mcp-results.js';

const aliases = {
	title: ['title', 'name'],
	url: ['url', 'link'],
	snippet: ['snippet', 'text'],
	score: ['score'],
};

describe('mcp result mapping', () => {
	it('walks object and array path segments', () => {
		expect(
			walk_result_path({ payload: [{ items: ['ok'] }] }, [
				'payload',
				0,
				'items',
			]),
		).toEqual({ ok: true, value: ['ok'] });
		expect(walk_result_path({ results: [] }, ['hits'])).toEqual({
			ok: false,
		});
	});

	it('reads structuredContent and JSON text tool payloads', () => {
		expect(
			extract_result_list(
				{
					structuredContent: {
						results: [
							{
								title: 'From structured',
								url: 'https://example.com/a',
							},
						],
					},
				},
				['results'],
				'exa_mcp',
			),
		).toEqual([
			{ title: 'From structured', url: 'https://example.com/a' },
		]);

		expect(
			extract_result_list(
				{
					content: [
						{
							type: 'text',
							text: JSON.stringify({
								results: [
									{
										title: 'From text',
										url: 'https://example.com/b',
									},
								],
							}),
						},
					],
				},
				['results'],
				'exa_mcp',
			),
		).toEqual([{ title: 'From text', url: 'https://example.com/b' }]);
	});

	it('treats a successful empty array as a real empty result', () => {
		expect(
			extract_result_list(
				{ structuredContent: { results: [] } },
				['results'],
				'exa_mcp',
			),
		).toEqual([]);
	});

	it('fails when the path is missing or not an array', () => {
		expect(() =>
			extract_result_list(
				{ content: [{ type: 'text', text: 'Title: Example' }] },
				['results'],
				'exa_mcp',
			),
		).toThrow(
			expect.objectContaining({
				type: ErrorType.MALFORMED_RESPONSE,
				message: expect.stringContaining('was not found'),
			}),
		);

		expect(() =>
			extract_result_list(
				{ structuredContent: { results: { title: 'nope' } } },
				['results'],
				'exa_mcp',
			),
		).toThrow(
			expect.objectContaining({
				type: ErrorType.MALFORMED_RESPONSE,
				message: expect.stringContaining(
					'did not resolve to an array',
				),
			}),
		);
	});

	it('fails tool errors and unmapped title/url fields', () => {
		expect(() =>
			extract_result_list(
				{
					isError: true,
					content: [{ type: 'text', text: 'tool exploded' }],
				},
				['results'],
				'exa_mcp',
			),
		).toThrow(
			expect.objectContaining({
				type: ErrorType.PROVIDER_ERROR,
				message: 'tool exploded',
				provider: 'exa_mcp',
			}),
		);

		expect(() =>
			map_mcp_search_results(
				[{ heading: 'Missing aliases', href: 'https://x.test' }],
				aliases,
				'exa_mcp',
			),
		).toThrow(
			expect.objectContaining({
				type: ErrorType.MALFORMED_RESPONSE,
				message: expect.stringContaining('missing title/url'),
			}),
		);
	});

	it('uses an empty result_path as the root list', () => {
		expect(
			extract_result_list(
				[
					{
						title: 'Root',
						url: 'https://example.com/root',
					},
				],
				[],
				'exa_mcp',
			),
		).toEqual([{ title: 'Root', url: 'https://example.com/root' }]);
	});

	it('fails when a result item is not an object', () => {
		expect(() =>
			map_mcp_search_results(['not-an-object'], aliases, 'exa_mcp'),
		).toThrow(
			expect.objectContaining({
				type: ErrorType.MALFORMED_RESPONSE,
				message: expect.stringContaining('is not an object'),
			}),
		);
	});

	it('maps field aliases into SearchResult rows', () => {
		expect(
			map_mcp_search_results(
				[
					{
						name: 'Example',
						link: 'https://example.com',
						text: 'Snippet',
						score: 0.4,
					},
				],
				aliases,
				'exa_mcp',
			),
		).toEqual([
			{
				title: 'Example',
				url: 'https://example.com',
				snippet: 'Snippet',
				score: 0.4,
				source_provider: 'exa_mcp',
			},
		]);
	});
});
