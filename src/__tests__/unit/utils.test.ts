import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
	validate_api_key,
	is_api_key_valid,
	handle_rate_limit,
	sanitize_query,
	create_error_response,
	merge_search_results,
	extract_domain,
	is_valid_url,
	delay,
	retry_with_backoff,
	parse_search_operators,
	apply_search_operators,
} from '../../common/utils.js';
import { ErrorType, ProviderError } from '../../common/types.js';

describe('Utility Functions', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('validate_api_key', () => {
		it('should return the key when valid', () => {
			const key = 'valid-api-key';
			const result = validate_api_key(key, 'test-provider');
			expect(result).toBe(key);
		});

		it('should throw ProviderError when key is undefined', () => {
			expect(() => validate_api_key(undefined, 'test-provider')).toThrow(
				ProviderError
			);
		});

		it('should throw ProviderError when key is empty string', () => {
			expect(() => validate_api_key('', 'test-provider')).toThrow(
				ProviderError
			);
		});

		it('should include provider name in error message', () => {
			try {
				validate_api_key(undefined, 'my-provider');
			} catch (error) {
				expect(error).toBeInstanceOf(ProviderError);
				expect((error as ProviderError).message).toContain('my-provider');
				expect((error as ProviderError).provider).toBe('my-provider');
				expect((error as ProviderError).type).toBe(ErrorType.INVALID_INPUT);
			}
		});
	});

	describe('is_api_key_valid', () => {
		it('should return true for valid key', () => {
			expect(is_api_key_valid('valid-key', 'provider')).toBe(true);
		});

		it('should return false for undefined key', () => {
			expect(is_api_key_valid(undefined, 'provider')).toBe(false);
		});

		it('should return false for empty string', () => {
			expect(is_api_key_valid('', 'provider')).toBe(false);
		});

		it('should return false for whitespace-only string', () => {
			expect(is_api_key_valid('   ', 'provider')).toBe(false);
		});
	});

	describe('handle_rate_limit', () => {
		it('should throw ProviderError with rate limit type', () => {
			expect(() => handle_rate_limit('test-provider')).toThrow(ProviderError);
		});

		it('should include reset time in error when provided', () => {
			const resetTime = new Date('2024-01-01T12:00:00Z');
			try {
				handle_rate_limit('test-provider', resetTime);
			} catch (error) {
				expect(error).toBeInstanceOf(ProviderError);
				expect((error as ProviderError).type).toBe(ErrorType.RATE_LIMIT);
				expect((error as ProviderError).message).toContain(resetTime.toISOString());
				expect((error as ProviderError).details).toEqual({ reset_time: resetTime });
			}
		});
	});

	describe('sanitize_query', () => {
		it('should trim whitespace', () => {
			expect(sanitize_query('  test query  ')).toBe('test query');
		});

		it('should replace newlines with spaces', () => {
			expect(sanitize_query('test\nquery\r\nwith\rnewlines')).toBe(
				'test query with newlines'
			);
		});

		it('should handle empty string', () => {
			expect(sanitize_query('')).toBe('');
		});

		it('should handle string with only whitespace', () => {
			expect(sanitize_query('   \n\r  ')).toBe('');
		});
	});

	describe('create_error_response', () => {
		it('should format ProviderError correctly', () => {
			const error = new ProviderError(
				ErrorType.API_ERROR,
				'Test error message',
				'test-provider'
			);
			const response = create_error_response(error);
			expect(response).toEqual({
				error: 'test-provider error: Test error message',
			});
		});

		it('should format generic Error correctly', () => {
			const error = new Error('Generic error message');
			const response = create_error_response(error);
			expect(response).toEqual({
				error: 'Unexpected error: Generic error message',
			});
		});
	});

	describe('merge_search_results', () => {
		const results = [
			{ title: 'Result 1', score: 0.8 },
			{ title: 'Result 2', score: 0.9 },
			{ title: 'Result 3', score: 0.7 },
			{ title: 'Result 4' }, // No score
		];

		it('should sort by score descending', () => {
			const merged = merge_search_results(results);
			expect(merged).toHaveLength(4);
			expect(merged[0].score).toBe(0.9);
			expect(merged[1].score).toBe(0.8);
			expect(merged[2].score).toBe(0.7);
			expect(merged[3].score).toBeUndefined();
		});

		it('should limit results when limit provided', () => {
			const merged = merge_search_results(results, 2);
			expect(merged).toHaveLength(2);
			expect(merged[0].score).toBe(0.9);
			expect(merged[1].score).toBe(0.8);
		});

		it('should handle empty array', () => {
			const merged = merge_search_results([]);
			expect(merged).toEqual([]);
		});
	});

	describe('extract_domain', () => {
		it('should extract domain from URL', () => {
			expect(extract_domain('https://example.com/path')).toBe('example.com');
		});

		it('should remove www prefix', () => {
			expect(extract_domain('https://www.example.com/path')).toBe('example.com');
		});

		it('should handle invalid URL', () => {
			expect(extract_domain('not-a-url')).toBe('');
		});

		it('should handle various protocols', () => {
			expect(extract_domain('http://example.com')).toBe('example.com');
			expect(extract_domain('ftp://example.com')).toBe('example.com');
		});
	});

	describe('is_valid_url', () => {
		it('should return true for valid URLs', () => {
			expect(is_valid_url('https://example.com')).toBe(true);
			expect(is_valid_url('http://example.com')).toBe(true);
			expect(is_valid_url('ftp://example.com')).toBe(true);
		});

		it('should return false for invalid URLs', () => {
			expect(is_valid_url('not-a-url')).toBe(false);
			expect(is_valid_url('')).toBe(false);
			expect(is_valid_url('example.com')).toBe(false); // Missing protocol
		});
	});

	describe('delay', () => {
		it('should resolve after specified time', async () => {
			const start = Date.now();
			await delay(100);
			const end = Date.now();
			expect(end - start).toBeGreaterThanOrEqual(90); // Allow some variance
		});
	});

	describe('retry_with_backoff', () => {
		it('should return result on first success', async () => {
			const fn = vi.fn().mockResolvedValue('success');
			const result = await retry_with_backoff(fn);
			expect(result).toBe('success');
			expect(fn).toHaveBeenCalledTimes(1);
		});

		it('should retry on failure and eventually succeed', async () => {
			const fn = vi
				.fn()
				.mockRejectedValueOnce(new Error('fail 1'))
				.mockRejectedValueOnce(new Error('fail 2'))
				.mockResolvedValue('success');

			const result = await retry_with_backoff(fn, 3, 10);
			expect(result).toBe('success');
			expect(fn).toHaveBeenCalledTimes(3);
		});

		it('should throw after max retries', async () => {
			const fn = vi.fn().mockRejectedValue(new Error('always fail'));

			await expect(retry_with_backoff(fn, 2, 10)).rejects.toThrow('always fail');
			expect(fn).toHaveBeenCalledTimes(3); // Initial + 2 retries
		});
	});

	describe('parse_search_operators', () => {
		it('should parse site operator', () => {
			const result = parse_search_operators('test query site:example.com');
			expect(result.base_query).toBe('test query');
			expect(result.operators).toHaveLength(1);
			expect(result.operators[0]).toEqual({
				type: 'site',
				value: 'example.com',
				original_text: 'site:example.com',
			});
		});

		it('should parse exclude site operator', () => {
			const result = parse_search_operators('test query -site:example.com');
			expect(result.base_query.replace(/\s+/g, ' ').trim()).toBe('test query');
			expect(result.operators).toHaveLength(1);
			expect(result.operators[0]).toEqual({
				type: 'exclude_site',
				value: 'example.com',
				original_text: '-site:example.com',
			});
		});

		it('should parse multiple operators', () => {
			const result = parse_search_operators(
				'test filetype:pdf site:example.com intitle:guide'
			);
			expect(result.base_query).toBe('test');
			expect(result.operators).toHaveLength(3);
		});

		it('should parse exact phrases', () => {
			const result = parse_search_operators('test "exact phrase" query');
			expect(result.base_query.replace(/\s+/g, ' ').trim()).toBe('test query');
			expect(result.operators).toHaveLength(1);
			expect(result.operators[0]).toEqual({
				type: 'exact',
				value: 'exact phrase',
				original_text: '"exact phrase"',
			});
		});

		it('should parse date operators', () => {
			const result = parse_search_operators('test before:2024 after:2023-01');
			expect(result.base_query).toBe('test');
			expect(result.operators).toHaveLength(2);
			expect(result.operators.find(op => op.type === 'before')?.value).toBe('2024');
			expect(result.operators.find(op => op.type === 'after')?.value).toBe('2023-01');
		});
	});

	describe('apply_search_operators', () => {
		it('should convert parsed operators to search params', () => {
			const parsed = {
				base_query: 'test query',
				operators: [
					{
						type: 'site' as const,
						value: 'example.com',
						original_text: 'site:example.com',
					},
					{
						type: 'filetype' as const,
						value: 'pdf',
						original_text: 'filetype:pdf',
					},
					{
						type: 'exact' as const,
						value: 'exact phrase',
						original_text: '"exact phrase"',
					},
				],
			};

			const params = apply_search_operators(parsed);
			expect(params.query).toBe('test query');
			expect(params.include_domains).toEqual(['example.com']);
			expect(params.file_type).toBe('pdf');
			expect(params.exact_phrases).toEqual(['exact phrase']);
		});

		it('should handle multiple domains', () => {
			const parsed = {
				base_query: 'test',
				operators: [
					{
						type: 'site' as const,
						value: 'example.com',
						original_text: 'site:example.com',
					},
					{
						type: 'site' as const,
						value: 'test.org',
						original_text: 'site:test.org',
					},
				],
			};

			const params = apply_search_operators(parsed);
			expect(params.include_domains).toEqual(['example.com', 'test.org']);
		});
	});
});