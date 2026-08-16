import type { SearchResult, SearchType } from './types.js';

export const NATIVE_NEWS_VALUES: Record<string, string> = {
	brave: 'news',
	tavily: 'news',
	exa: 'news',
	kagi_enrichment: 'news',
};

export interface SearchTypeMetadata {
	requested: SearchType;
	applied: boolean;
	provider: string;
	native_value?: string;
	reason?: string;
}

export const search_type_metadata = (
	provider: string,
	requested: SearchType,
): SearchTypeMetadata => {
	if (requested === 'search') {
		return {
			requested,
			applied: true,
			provider,
			native_value: 'search',
		};
	}

	const native_value = NATIVE_NEWS_VALUES[provider];
	if (native_value) {
		return {
			requested,
			applied: true,
			provider,
			native_value,
		};
	}

	return {
		requested,
		applied: false,
		provider,
		reason: `provider ${provider} does not support search_type ${requested}`,
	};
};

export const with_search_type_metadata = (
	results: SearchResult[],
	provider: string,
	requested?: SearchType,
): SearchResult[] => {
	if (!requested) return results;

	const search_type = search_type_metadata(provider, requested);
	return results.map((result) => ({
		...result,
		metadata: {
			...result.metadata,
			search_type,
		},
	}));
};
