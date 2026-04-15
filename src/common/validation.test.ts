import { describe, expect, it, vi } from 'vitest';
import { ErrorType } from './types.js';
import {
	is_api_key_valid,
	is_valid_url,
	validate_api_key,
	validate_processing_urls,
} from './validation.js';

describe('validate_api_key', () => {
	it('trims whitespace and strips surrounding quotes', () => {
		expect(validate_api_key('  "secret-key"  ', 'tavily')).toBe(
			'secret-key',
		);
	});

	it('throws a provider error when the key is missing', () => {
		expect(() => validate_api_key(undefined, 'brave')).toThrowError(
			expect.objectContaining({
				type: ErrorType.INVALID_INPUT,
				provider: 'brave',
				message: 'API key not found for brave',
			}),
		);
	});
});

describe('is_api_key_valid', () => {
	it('returns true for a non-empty key', () => {
		expect(is_api_key_valid('abc123', 'exa')).toBe(true);
	});

	it('warns and returns false for an empty key', () => {
		const warn = vi
			.spyOn(console, 'warn')
			.mockImplementation(() => {});

		expect(is_api_key_valid('   ', 'exa')).toBe(false);
		expect(warn).toHaveBeenCalledWith(
			'API key not found or empty for exa',
		);
	});
});

describe('is_valid_url', () => {
	it('accepts valid absolute URLs', () => {
		expect(is_valid_url('https://example.com/path?q=1')).toBe(true);
	});

	it('rejects invalid URLs', () => {
		expect(is_valid_url('not-a-url')).toBe(false);
	});
});

describe('validate_processing_urls', () => {
	it('normalizes a single URL into an array', () => {
		expect(
			validate_processing_urls('https://example.com', 'firecrawl'),
		).toEqual(['https://example.com']);
	});

	it('returns an array unchanged when all URLs are valid', () => {
		expect(
			validate_processing_urls(
				['https://example.com', 'https://kit.svelte.dev'],
				'firecrawl',
			),
		).toEqual(['https://example.com', 'https://kit.svelte.dev']);
	});

	it('throws a provider error for invalid URLs', () => {
		expect(() =>
			validate_processing_urls(
				['https://example.com', 'nope'],
				'firecrawl',
			),
		).toThrowError(
			expect.objectContaining({
				type: ErrorType.INVALID_INPUT,
				provider: 'firecrawl',
				message: 'Invalid URL provided: nope',
			}),
		);
	});
});
