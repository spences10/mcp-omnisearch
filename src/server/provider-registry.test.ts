import { describe, expect, it } from 'vitest';
import { ProviderError } from '../common/types.js';
import { ProviderRegistry } from './provider-registry.js';

describe('ProviderRegistry', () => {
	it('registers providers with valid API keys', () => {
		const registry = new ProviderRegistry<{ name: string }>();

		registry.register({
			id: 'brave',
			name: 'brave',
			category: 'search',
			api_key: 'key',
			create: () => ({ name: 'brave' }),
		});

		expect(registry.size).toBe(1);
		expect(registry.ids()).toEqual(['brave']);
		expect(registry.names()).toEqual(['brave']);
		expect(registry.get('brave')).toEqual({ name: 'brave' });
		expect(registry.status_entries()).toEqual([
			expect.objectContaining({
				id: 'brave',
				name: 'brave',
				category: 'search',
				status: 'available',
				api_key_name: 'brave',
				auto_allow: true,
			}),
		]);
	});

	it('skips providers with missing API keys', () => {
		const registry = new ProviderRegistry<{ name: string }>();

		registry.register({
			id: 'brave',
			name: 'brave',
			category: 'search',
			api_key: undefined,
			create: () => ({ name: 'brave' }),
		});

		expect(registry.size).toBe(0);
		expect(registry.get('brave')).toBeUndefined();
		expect(registry.status_entries()).toEqual([
			expect.objectContaining({
				id: 'brave',
				name: 'brave',
				category: 'search',
				status: 'unavailable',
				unavailable_reason: 'missing_api_key',
			}),
		]);
	});

	it('deduplicates provider names across multiple ids', () => {
		const registry = new ProviderRegistry<{ mode: string }>();

		registry.register({
			id: 'exa:contents',
			name: 'exa',
			category: 'processing',
			api_key: 'key',
			create: () => ({ mode: 'contents' }),
		});
		registry.register({
			id: 'exa:similar',
			name: 'exa',
			category: 'processing',
			api_key: 'key',
			create: () => ({ mode: 'similar' }),
		});

		expect(registry.ids()).toEqual(['exa:contents', 'exa:similar']);
		expect(registry.names()).toEqual(['exa']);
	});

	it('throws a ProviderError when requiring a missing provider', () => {
		const registry = new ProviderRegistry<{ name: string }>();

		expect(() => registry.require('missing', 'web_search')).toThrow(
			expect.objectContaining({
				provider: 'web_search',
				message: 'Provider "missing" is not available. Available: ',
			}),
		);
		expect(() => registry.require('missing', 'web_search')).toThrow(
			ProviderError,
		);
	});

	it('keeps gated providers callable by explicit id', () => {
		const registry = new ProviderRegistry<{ name: string }>();

		registry.register({
			id: 'parallel',
			name: 'parallel',
			category: 'search',
			api_key: 'key',
			auto_allow: false,
			create: () => ({ name: 'parallel' }),
		});

		expect(registry.require('parallel', 'web_search')).toEqual({
			name: 'parallel',
		});
		expect(registry.automatic_ids()).toEqual([]);
		expect(registry.auto_allow_quality_report()).toEqual({
			auto_allow_excluded: ['parallel'],
		});
	});

	it('excludes env-denied providers from automatic selection', () => {
		const registry = new ProviderRegistry<{ name: string }>();

		registry.register(
			{
				id: 'exa',
				name: 'exa',
				category: 'search',
				api_key: 'key',
				create: () => ({ name: 'exa' }),
			},
			{ OMNISEARCH_AUTO_DENY: 'exa' },
		);
		registry.register(
			{
				id: 'tavily',
				name: 'tavily',
				category: 'search',
				api_key: 'key',
				create: () => ({ name: 'tavily' }),
			},
			{ OMNISEARCH_AUTO_DENY: 'exa' },
		);

		expect(registry.automatic_ids()).toEqual(['tavily']);
		expect(registry.ids()).toEqual(['exa', 'tavily']);
		expect(registry.auto_allow_quality_report()).toEqual({
			auto_allow_excluded: ['exa'],
		});
	});

	it('opts a declared-gated provider into automatic use', () => {
		const registry = new ProviderRegistry<{ name: string }>();

		registry.register(
			{
				id: 'parallel',
				name: 'parallel',
				category: 'search',
				api_key: 'key',
				auto_allow: false,
				create: () => ({ name: 'parallel' }),
			},
			{ OMNISEARCH_AUTO_ALLOW: 'parallel' },
		);

		expect(registry.automatic_ids()).toEqual(['parallel']);
		expect(registry.auto_allow_quality_report()).toEqual({
			auto_allow_excluded: [],
		});
	});
});
