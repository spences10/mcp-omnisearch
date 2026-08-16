import { describe, expect, it } from 'vitest';
import {
	extract_bearer_token,
	match_auth_token,
} from './http-auth.js';

describe('extract_bearer_token', () => {
	it('reads a Bearer token from Authorization', () => {
		expect(extract_bearer_token('Bearer secret-token')).toBe(
			'secret-token',
		);
		expect(extract_bearer_token('bearer secret-token')).toBe(
			'secret-token',
		);
	});

	it('returns undefined for missing or non-bearer credentials', () => {
		expect(extract_bearer_token(undefined)).toBeUndefined();
		expect(extract_bearer_token('Basic abc')).toBeUndefined();
		expect(extract_bearer_token('Bearer')).toBeUndefined();
		expect(extract_bearer_token('Bearer ')).toBeUndefined();
	});
});

describe('match_auth_token', () => {
	it('returns the configured token on a match', () => {
		expect(match_auth_token('beta', ['alpha', 'beta'])).toBe('beta');
	});

	it('returns undefined when the presented token is unknown', () => {
		expect(
			match_auth_token('nope', ['alpha', 'beta']),
		).toBeUndefined();
		expect(match_auth_token('alpha', [])).toBeUndefined();
	});
});
