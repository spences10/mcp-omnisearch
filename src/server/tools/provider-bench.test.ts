import { describe, expect, it } from 'vitest';
import type { SearchProvider } from '../../common/types.js';
import type { RegisteredProvider } from '../provider-registry.js';
import { to_benchable_providers } from './provider-bench.js';

describe('provider_bench tool helpers', () => {
	it('adapts registered search providers for the bench runner', async () => {
		const search = async () => [
			{
				title: 'Example',
				url: 'https://example.com',
				snippet: 'Hello',
				source_provider: 'brave',
			},
		];
		const entries = [
			{
				id: 'brave',
				name: 'brave',
				category: 'search',
				instance: {
					name: 'brave',
					description: 'Brave Search',
					search,
				},
				tools: ['web_search'],
				modes: [],
				capabilities: ['web_search'],
			},
		] as RegisteredProvider<SearchProvider>[];

		const benchable = to_benchable_providers(entries);
		expect(benchable).toHaveLength(1);
		expect(benchable[0].id).toBe('brave');
		await expect(
			benchable[0].search({ query: 'test' }),
		).resolves.toEqual([
			{
				title: 'Example',
				url: 'https://example.com',
				snippet: 'Hello',
				source_provider: 'brave',
			},
		]);
	});
});
