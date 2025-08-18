import { describe, it, expect } from 'vitest';
import { ErrorType, ProviderError } from '../../common/types.js';

describe('Types and Classes', () => {
	describe('ProviderError', () => {
		it('should create error with all properties', () => {
			const details = { statusCode: 400, retry: true };
			const error = new ProviderError(
				ErrorType.API_ERROR,
				'Test error message',
				'test-provider',
				details
			);

			expect(error).toBeInstanceOf(Error);
			expect(error).toBeInstanceOf(ProviderError);
			expect(error.name).toBe('ProviderError');
			expect(error.type).toBe(ErrorType.API_ERROR);
			expect(error.message).toBe('Test error message');
			expect(error.provider).toBe('test-provider');
			expect(error.details).toEqual(details);
		});

		it('should create error without details', () => {
			const error = new ProviderError(
				ErrorType.RATE_LIMIT,
				'Rate limit exceeded',
				'api-provider'
			);

			expect(error.type).toBe(ErrorType.RATE_LIMIT);
			expect(error.message).toBe('Rate limit exceeded');
			expect(error.provider).toBe('api-provider');
			expect(error.details).toBeUndefined();
		});

		it('should have correct error types', () => {
			expect(ErrorType.API_ERROR).toBe('API_ERROR');
			expect(ErrorType.RATE_LIMIT).toBe('RATE_LIMIT');
			expect(ErrorType.INVALID_INPUT).toBe('INVALID_INPUT');
			expect(ErrorType.PROVIDER_ERROR).toBe('PROVIDER_ERROR');
		});
	});
});