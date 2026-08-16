import { describe, expect, it, vi } from 'vitest';
import { ErrorType, ProviderError } from '../../common/types.js';
import type {
	SearchProvider,
	SearchResult,
} from '../../common/types.js';
import {
	merge_search_results,
	resolve_configured_providers,
	search_providers_concurrently,
} from './web-search-fanout.js';

const result = (
	provider: string,
	url: string,
	title = provider,
): SearchResult => ({
	title,
	url,
	snippet: title,
	source_provider: provider,
});

const provider_of = (
	name: string,
	search: SearchProvider['search'],
): SearchProvider => ({
	name,
	description: name,
	search,
});

const deferred = <T>() => {
	let resolve!: (value: T | PromiseLike<T>) => void;
	const promise = new Promise<T>((res) => {
		resolve = res;
	});
	return { promise, resolve };
};

describe('resolve_configured_providers', () => {
	it('keeps requested order, skips missing keys, and deduplicates names', () => {
		const exa = provider_of('exa', async () => []);
		const registry = new Map<string, SearchProvider>([['exa', exa]]);

		expect(
			resolve_configured_providers(
				['tavily', 'exa', 'exa', 'brave'],
				(id) => registry.get(id),
			),
		).toEqual([{ id: 'exa', provider: exa }]);
	});
});

describe('merge_search_results', () => {
	it('concatenates groups in order and keeps the first URL', () => {
		expect(
			merge_search_results([
				[result('exa', 'https://shared.test', 'Exa')],
				[
					result('tavily', 'https://shared.test', 'Tavily'),
					result('tavily', 'https://tavily.test'),
				],
			]),
		).toEqual([
			result('exa', 'https://shared.test', 'Exa'),
			result('tavily', 'https://tavily.test'),
		]);
	});
});

describe('search_providers_concurrently', () => {
	it('starts selected providers before either search resolves', async () => {
		const started: string[] = [];
		const exa_gate = deferred<void>();
		const tavily_gate = deferred<void>();

		const pending = search_providers_concurrently(
			[
				{
					id: 'exa',
					provider: provider_of('exa', async () => {
						started.push('exa');
						await exa_gate.promise;
						return [result('exa', 'https://exa.test')];
					}),
				},
				{
					id: 'tavily',
					provider: provider_of('tavily', async () => {
						started.push('tavily');
						await tavily_gate.promise;
						return [result('tavily', 'https://tavily.test')];
					}),
				},
			],
			{ query: 'sveltekit' },
			1000,
		);

		await vi.waitFor(() => {
			expect(started).toEqual(
				expect.arrayContaining(['exa', 'tavily']),
			);
		});
		expect(started).toHaveLength(2);

		exa_gate.resolve();
		tavily_gate.resolve();

		await expect(pending).resolves.toEqual([
			result('exa', 'https://exa.test'),
			result('tavily', 'https://tavily.test'),
		]);
	});

	it('keeps successful results when another selected provider fails', async () => {
		await expect(
			search_providers_concurrently(
				[
					{
						id: 'exa',
						provider: provider_of('exa', async () => [
							result('exa', 'https://exa.test'),
						]),
					},
					{
						id: 'tavily',
						provider: provider_of('tavily', async () => {
							throw new ProviderError(
								ErrorType.API_ERROR,
								'upstream failed',
								'tavily',
							);
						}),
					},
				],
				{ query: 'sveltekit' },
				1000,
			),
		).resolves.toEqual([result('exa', 'https://exa.test')]);
	});

	it('returns completed results when the shared timeout fires', async () => {
		await expect(
			search_providers_concurrently(
				[
					{
						id: 'exa',
						provider: provider_of('exa', async () => [
							result('exa', 'https://exa.test'),
						]),
					},
					{
						id: 'tavily',
						provider: provider_of(
							'tavily',
							() => new Promise(() => {}),
						),
					},
				],
				{ query: 'sveltekit' },
				25,
			),
		).resolves.toEqual([result('exa', 'https://exa.test')]);
	});

	it('throws when the shared timeout elapses before any provider returns', async () => {
		await expect(
			search_providers_concurrently(
				[
					{
						id: 'exa',
						provider: provider_of('exa', () => new Promise(() => {})),
					},
				],
				{ query: 'sveltekit' },
				20,
			),
		).rejects.toMatchObject({
			type: ErrorType.TIMEOUT,
			provider: 'web_search',
		});
	});

	it('throws the first provider error when every selected provider fails', async () => {
		const failure = new ProviderError(
			ErrorType.AUTH_ERROR,
			'Invalid API key',
			'exa',
			{ retryable: false },
		);

		await expect(
			search_providers_concurrently(
				[
					{
						id: 'exa',
						provider: provider_of('exa', async () => {
							throw failure;
						}),
					},
				],
				{ query: 'sveltekit' },
				1000,
			),
		).rejects.toBe(failure);
	});
});
