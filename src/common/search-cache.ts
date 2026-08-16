import {
	is_search_cache_disabled,
	parse_search_cache_ttl_ms,
} from '../config/env.js';

export const DEFAULT_SEARCH_LIMIT = 10;

export interface SearchCacheKeyParts {
	query: string;
	provider: string;
	limit?: number;
	include_domains?: string[];
	exclude_domains?: string[];
	filters?: Record<string, unknown>;
}

export interface SearchCacheRecord<T> {
	value: T;
	expires_at: number;
}

export interface SearchCacheStore<T> {
	get(key: string): SearchCacheRecord<T> | undefined;
	set(key: string, record: SearchCacheRecord<T>): void;
	delete?(key: string): void;
}

export interface SearchCacheOptions<T> {
	ttl_ms?: number;
	now?: () => number;
	store?: SearchCacheStore<T>;
	clone?: (value: T) => T;
}

export interface SearchCacheSetOptions {
	// Incomplete multi-provider responses must not be stored
	// as if they were a full answer.
	complete?: boolean;
}

export interface MultiProviderSearchOutcome {
	complete?: boolean;
	failed_providers?: string[];
	succeeded_providers?: string[];
	selected_providers?: string[];
}

export interface CachedSearchOptions<T> {
	no_cache?: boolean;
	env?: NodeJS.ProcessEnv;
	cache?: SearchCache<T>;
	complete?: boolean | ((value: T) => boolean);
}

const clone_value = <T>(value: T): T => {
	if (typeof structuredClone === 'function') {
		return structuredClone(value);
	}

	return JSON.parse(JSON.stringify(value)) as T;
};

const normalize_query = (query: string): string =>
	query.trim().replace(/\s+/g, ' ').toLowerCase();

const normalize_domain_list = (domains?: string[]): string[] => {
	if (!domains?.length) return [];

	return [
		...new Set(
			domains
				.map((domain) => domain.trim().toLowerCase())
				.filter(Boolean),
		),
	].sort();
};

const normalize_filters = (
	filters?: Record<string, unknown>,
): Record<string, unknown> | undefined => {
	if (!filters) return undefined;

	const entries = Object.entries(filters)
		.filter(([, value]) => value !== undefined)
		.sort(([left], [right]) => left.localeCompare(right));

	if (entries.length === 0) return undefined;

	return Object.fromEntries(entries);
};

export const build_search_cache_key = (
	parts: SearchCacheKeyParts,
): string =>
	JSON.stringify({
		query: normalize_query(parts.query),
		provider: parts.provider.trim().toLowerCase(),
		limit: parts.limit ?? DEFAULT_SEARCH_LIMIT,
		include_domains: normalize_domain_list(parts.include_domains),
		exclude_domains: normalize_domain_list(parts.exclude_domains),
		filters: normalize_filters(parts.filters),
	});

export const is_complete_search_outcome = (
	outcome?: MultiProviderSearchOutcome,
): boolean => {
	if (!outcome) return true;
	if (outcome.complete === false) return false;
	if ((outcome.failed_providers?.length ?? 0) > 0) return false;

	const selected = outcome.selected_providers;
	const succeeded = outcome.succeeded_providers;
	if (selected && succeeded && selected.length !== succeeded.length) {
		return false;
	}

	return true;
};

export const is_search_cache_bypassed = (
	no_cache = false,
	env: NodeJS.ProcessEnv = process.env,
): boolean => no_cache === true || is_search_cache_disabled(env);

class MemorySearchCacheStore<T> implements SearchCacheStore<T> {
	private readonly records = new Map<string, SearchCacheRecord<T>>();

	get(key: string) {
		return this.records.get(key);
	}

	set(key: string, record: SearchCacheRecord<T>) {
		this.records.set(key, record);
	}

	delete(key: string) {
		this.records.delete(key);
	}
}

export class SearchCache<T = unknown> {
	private readonly ttl_ms: number;
	private readonly now: () => number;
	private readonly store: SearchCacheStore<T>;
	private readonly clone: (value: T) => T;

	constructor(options: SearchCacheOptions<T> = {}) {
		this.ttl_ms = options.ttl_ms ?? parse_search_cache_ttl_ms();
		this.now = options.now ?? Date.now;
		this.store = options.store ?? new MemorySearchCacheStore<T>();
		this.clone = options.clone ?? clone_value;
	}

	get(key: string): T | undefined {
		try {
			const record = this.store.get(key);
			if (!record) return undefined;

			if (record.expires_at <= this.now()) {
				this.store.delete?.(key);
				return undefined;
			}

			return this.clone(record.value);
		} catch {
			return undefined;
		}
	}

	set(
		key: string,
		value: T,
		options: SearchCacheSetOptions = {},
	): boolean {
		if (options.complete === false) return false;

		try {
			this.store.set(key, {
				value: this.clone(value),
				expires_at: this.now() + this.ttl_ms,
			});
			return true;
		} catch {
			return false;
		}
	}
}

let default_search_cache: SearchCache<unknown> | undefined;

export const get_default_search_cache = <T>(
	env: NodeJS.ProcessEnv = process.env,
): SearchCache<T> => {
	default_search_cache ??= new SearchCache({
		ttl_ms: parse_search_cache_ttl_ms(env),
	});
	return default_search_cache as SearchCache<T>;
};

export const reset_default_search_cache = () => {
	default_search_cache = undefined;
};

export const cached_search = async <T>(
	key_parts: SearchCacheKeyParts,
	load: () => Promise<T>,
	options: CachedSearchOptions<T> = {},
): Promise<T> => {
	const env = options.env ?? process.env;
	const cache = options.cache ?? get_default_search_cache<T>(env);

	if (is_search_cache_bypassed(options.no_cache, env)) {
		return load();
	}

	const key = build_search_cache_key(key_parts);
	const hit = cache.get(key);
	if (hit !== undefined) return hit;

	const value = await load();
	const complete =
		typeof options.complete === 'function'
			? options.complete(value)
			: (options.complete ?? true);

	cache.set(key, value, { complete });
	return value;
};
