import * as v from 'valibot';
import { describe, expect, it } from 'vitest';
import { parse_provider_response } from './provider-response.js';
import { ErrorType, ProviderError } from './types.js';

describe('parse_provider_response', () => {
	const schema = v.object({
		results: v.array(
			v.object({
				title: v.string(),
				url: v.string(),
			}),
		),
	});

	it('returns parsed provider payloads', () => {
		expect(
			parse_provider_response('tavily', schema, {
				results: [{ title: 'Docs', url: 'https://example.com' }],
			}),
		).toEqual({
			results: [{ title: 'Docs', url: 'https://example.com' }],
		});
	});

	it('throws ProviderError for malformed provider payloads', () => {
		expect(() =>
			parse_provider_response('tavily', schema, {
				results: [{ title: 'Docs' }],
			}),
		).toThrow(
			expect.objectContaining({
				name: 'ProviderError',
				type: ErrorType.PROVIDER_ERROR,
				provider: 'tavily',
			}),
		);

		expect(() =>
			parse_provider_response('tavily', schema, {
				results: [{ title: 'Docs' }],
			}),
		).toThrow(ProviderError);
	});
});
