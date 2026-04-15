import { existsSync, readFileSync, rmSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import {
	aggregate_url_results,
	handle_large_result,
} from './results.js';
import { ErrorType } from './types.js';

const created_files: string[] = [];

afterEach(() => {
	for (const file of created_files.splice(0)) {
		if (existsSync(file)) {
			rmSync(file);
		}
	}
});

describe('handle_large_result', () => {
	it('returns the original result when it is safely sized', () => {
		const result = {
			content: 'small result',
			metadata: { word_count: 2 },
			source_provider: 'exa',
		};

		expect(handle_large_result(result, 'web_extract')).toBe(result);
	});

	it('writes oversized results to a temporary file with section hints', () => {
		const large_result = {
			raw_contents: [
				{
					url: 'https://example.com/article',
					content: '# Heading\nThis is a large extracted page.',
				},
			],
			metadata: {
				word_count: 6,
				urls_processed: 1,
			},
			source_provider: 'tavily',
			padding: 'x'.repeat(90000),
		};

		const result = handle_large_result(
			large_result,
			'web_extract',
		) as {
			file_path: string;
			total_lines: number;
			estimated_tokens: number;
			sections: Array<{ title: string; line: number }>;
			metadata: Record<string, unknown>;
			read_hint: string;
		};

		created_files.push(result.file_path);

		expect(result.file_path).toContain('mcp-web_extract-');
		expect(result.total_lines).toBeGreaterThan(0);
		expect(result.estimated_tokens).toBeGreaterThan(20000);
		expect(result.sections).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					title: 'URL: https://example.com/article',
				}),
				expect.objectContaining({ title: 'Heading' }),
				expect.objectContaining({ title: 'METADATA' }),
			]),
		);
		expect(result.read_hint).toContain(result.file_path);
		expect(result.metadata).toEqual({
			word_count: 6,
			urls_processed: 1,
			source_provider: 'tavily',
		});

		const written = readFileSync(result.file_path, 'utf8');
		expect(written).toContain('URL: https://example.com/article');
		expect(written).toContain('# Heading');
		expect(written).toContain('METADATA');
	});
});

describe('aggregate_url_results', () => {
	it('combines successful results and reports failures in metadata', () => {
		const result = aggregate_url_results(
			[
				{
					url: 'https://example.com/a',
					content: 'hello world',
					metadata: { title: 'Article A' },
					success: true,
				},
				{
					url: 'https://example.com/b',
					content: 'another article',
					success: true,
				},
				{
					url: 'https://example.com/c',
					content: '',
					success: false,
					error: 'failed',
				},
			],
			'firecrawl',
			[
				'https://example.com/a',
				'https://example.com/b',
				'https://example.com/c',
			],
			'advanced',
		);

		expect(result).toEqual({
			content: 'hello world\n\nanother article',
			raw_contents: [
				{ url: 'https://example.com/a', content: 'hello world' },
				{ url: 'https://example.com/b', content: 'another article' },
			],
			metadata: {
				title: 'Article A',
				word_count: 4,
				failed_urls: ['https://example.com/c'],
				urls_processed: 3,
				successful_extractions: 2,
				extract_depth: 'advanced',
			},
			source_provider: 'firecrawl',
		});
	});

	it('throws when every URL fails', () => {
		expect(() =>
			aggregate_url_results(
				[
					{
						url: 'https://example.com/a',
						content: '',
						success: false,
						error: 'failed',
					},
				],
				'firecrawl',
				['https://example.com/a'],
				'basic',
			),
		).toThrowError(
			expect.objectContaining({
				type: ErrorType.PROVIDER_ERROR,
				provider: 'firecrawl',
				message: 'Failed to extract content from all URLs',
			}),
		);
	});
});
