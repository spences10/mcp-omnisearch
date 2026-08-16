import { retry_with_backoff } from '../../common/retry.js';
import {
	ErrorType,
	ProviderError,
	type BaseSearchParams,
	type SearchProvider,
	type SearchResult,
} from '../../common/types.js';

export interface SelectedSearchProvider {
	id: string;
	provider: SearchProvider;
}

const fanout_timeout_error = () =>
	new ProviderError(
		ErrorType.TIMEOUT,
		'Concurrent web_search timed out',
		'web_search',
		{ retryable: true },
	);

const deadline_from_signal = (signal: AbortSignal) =>
	new Promise<never>((_, reject) => {
		if (signal.aborted) {
			reject(fanout_timeout_error());
			return;
		}

		signal.addEventListener(
			'abort',
			() => {
				reject(fanout_timeout_error());
			},
			{ once: true },
		);
	});

export const resolve_configured_providers = (
	requested: readonly string[],
	get_provider: (id: string) => SearchProvider | undefined,
): SelectedSearchProvider[] => {
	const seen = new Set<string>();
	const selected: SelectedSearchProvider[] = [];

	for (const id of requested) {
		if (seen.has(id)) continue;
		seen.add(id);

		const provider = get_provider(id);
		if (!provider) continue;

		selected.push({ id, provider });
	}

	return selected;
};

export const merge_search_results = (
	groups: readonly SearchResult[][],
): SearchResult[] => {
	const seen_urls = new Set<string>();
	const merged: SearchResult[] = [];

	for (const group of groups) {
		for (const result of group) {
			if (seen_urls.has(result.url)) continue;
			seen_urls.add(result.url);
			merged.push(result);
		}
	}

	return merged;
};

export const search_providers_concurrently = async (
	selected: readonly SelectedSearchProvider[],
	params: BaseSearchParams,
	timeout_ms: number,
): Promise<SearchResult[]> => {
	const deadline = deadline_from_signal(
		AbortSignal.timeout(timeout_ms),
	);

	const settled = await Promise.allSettled(
		selected.map(({ provider }) =>
			Promise.race([
				retry_with_backoff(() => provider.search(params)),
				deadline,
			]),
		),
	);

	const groups: SearchResult[][] = [];
	const errors: unknown[] = [];

	for (const result of settled) {
		if (result.status === 'fulfilled') {
			groups.push(result.value);
			continue;
		}

		errors.push(result.reason);
	}

	if (groups.length === 0) {
		const first_error = errors[0];
		if (first_error instanceof ProviderError) {
			throw first_error;
		}

		throw new ProviderError(
			ErrorType.PROVIDER_ERROR,
			'All requested providers failed',
			'web_search',
		);
	}

	return merge_search_results(groups);
};
