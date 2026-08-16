import { DEFAULT_RRF_K, get_rrf_k } from '../config/env.js';
import type { SearchResult, SearchResultSource } from './types.js';

const TRACKING_QUERY_KEYS = new Set(['fbclid', 'gclid']);
const TRACKING_QUERY_PREFIXES = ['utm_'];

export interface MergeSearchResultOptions {
	k?: number;
	limit?: number;
}

const is_tracking_query_key = (key: string) => {
	const normalized = key.toLowerCase();
	return (
		TRACKING_QUERY_KEYS.has(normalized) ||
		TRACKING_QUERY_PREFIXES.some((prefix) =>
			normalized.startsWith(prefix),
		)
	);
};

const canonicalize_url = (url: string): string | undefined => {
	const trimmed = url.trim();
	if (!trimmed) return undefined;

	try {
		const parsed = new URL(trimmed);
		const hostname = parsed.hostname.toLowerCase();
		if (!hostname) {
			return `url:${trimmed.toLowerCase()}`;
		}

		const params = [...parsed.searchParams.entries()]
			.filter(([key]) => !is_tracking_query_key(key))
			.sort(
				([left_key, left_value], [right_key, right_value]) =>
					left_key.localeCompare(right_key) ||
					left_value.localeCompare(right_value),
			);

		const path = parsed.pathname.replace(/\/+$/, '') || '/';
		const search = params.length
			? `?${new URLSearchParams(params).toString()}`
			: '';

		return `url:${parsed.protocol}//${parsed.host.toLowerCase()}${path}${search}`;
	} catch {
		return `url:${trimmed.toLowerCase()}`;
	}
};

const canonicalize_title = (title: string): string | undefined => {
	const normalized = title.replace(/\s+/g, ' ').trim().toLowerCase();
	return normalized ? `title:${normalized}` : undefined;
};

export const result_identity_key = (
	url: string,
	title: string,
): string => canonicalize_url(url) ?? canonicalize_title(title) ?? '';

const resolve_rrf_k = (k?: number): number => {
	if (k !== undefined && Number.isInteger(k) && k >= 1) {
		return k;
	}

	return get_rrf_k();
};

const to_source = (
	result: SearchResult,
	rank: number,
): SearchResultSource => {
	const source: SearchResultSource = {
		provider: result.source_provider,
		rank,
	};

	if (result.score !== undefined) {
		source.score = result.score;
	}

	return source;
};

const fuse_result_lists = (
	lists: readonly SearchResult[][],
	k: number,
	limit?: number,
): SearchResult[] => {
	const fused = new Map<
		string,
		SearchResult & { score: number; sources: SearchResultSource[] }
	>();

	const named_lists = lists
		.filter((list) => list.length > 0)
		.map((results) => ({
			provider: results[0].source_provider,
			results,
		}))
		.sort((left, right) =>
			left.provider.localeCompare(right.provider),
		);

	for (const { results } of named_lists) {
		const seen_keys = new Set<string>();

		for (const [index, result] of results.entries()) {
			const key = result_identity_key(result.url, result.title);
			if (!key || seen_keys.has(key)) continue;
			seen_keys.add(key);

			const rank = index + 1;
			const contribution = 1 / (k + rank);
			const source = to_source(result, rank);
			const existing = fused.get(key);

			if (!existing) {
				fused.set(key, {
					title: result.title,
					url: result.url,
					snippet: result.snippet,
					score: contribution,
					source_provider: result.source_provider,
					sources: [source],
					metadata: result.metadata,
				});
				continue;
			}

			existing.score += contribution;
			existing.sources.push(source);
			existing.title = existing.title || result.title;
			existing.url = existing.url || result.url;
			existing.snippet = existing.snippet || result.snippet;
			existing.metadata = existing.metadata ?? result.metadata;
		}
	}

	for (const result of fused.values()) {
		result.sources.sort(
			(left, right) =>
				left.provider.localeCompare(right.provider) ||
				left.rank - right.rank,
		);
	}

	const ranked = [...fused.values()].sort((left, right) => {
		if (right.score !== left.score) return right.score - left.score;

		const left_key = result_identity_key(left.url, left.title);
		const right_key = result_identity_key(right.url, right.title);
		return (
			left_key.localeCompare(right_key) ||
			left.title
				.toLowerCase()
				.localeCompare(right.title.toLowerCase())
		);
	});

	return limit === undefined ? ranked : ranked.slice(0, limit);
};

// Single-provider calls stay a plain list. Multi-provider lists are
// fused with RRF: sum(1 / (k + rank)), default k = 60.
export const merge_search_result_lists = (
	lists: readonly SearchResult[][],
	options: MergeSearchResultOptions = {},
): SearchResult[] => {
	const non_empty = lists.filter((list) => list.length > 0);
	if (non_empty.length <= 1) {
		return non_empty[0] ? [...non_empty[0]] : [];
	}

	return fuse_result_lists(
		non_empty,
		resolve_rrf_k(options.k),
		options.limit,
	);
};

export { DEFAULT_RRF_K };
