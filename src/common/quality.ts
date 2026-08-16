import { parse_search_operators } from './search-operators.js';
import { SPAM_MIRROR_DOMAINS } from './spam-domains.js';
import type { SpamFilteredMetadata } from './types.js';

export interface SearchQualityOptions {
	query?: string;
	include_domains?: string[];
	filter_spam?: boolean;
	max_results_per_domain?: number;
	blocked_domains?: string[];
	allowed_domains?: string[];
}

export interface SearchQualityResult<T> {
	results: T[];
	metadata: {
		spam_filtered: SpamFilteredMetadata;
	};
}

// Common multi-part public suffixes so blog.example.co.uk and
// docs.example.co.uk share a registrable domain. Keep this list
// small; unknown suffixes fall back to the last two labels.
const MULTI_PART_PUBLIC_SUFFIXES = new Set([
	'ac.uk',
	'co.uk',
	'gov.uk',
	'ltd.uk',
	'me.uk',
	'net.uk',
	'org.uk',
	'plc.uk',
	'com.au',
	'net.au',
	'org.au',
	'edu.au',
	'gov.au',
	'co.nz',
	'net.nz',
	'org.nz',
	'govt.nz',
	'ac.nz',
	'co.jp',
	'ne.jp',
	'or.jp',
	'ac.jp',
	'go.jp',
	'com.br',
	'com.mx',
	'com.ar',
	'co.in',
	'com.sg',
	'com.hk',
	'co.za',
	'com.tw',
	'co.kr',
	'github.io',
	'gitlab.io',
]);

export const normalize_hostname = (value: string): string => {
	let host = value.trim().toLowerCase();
	if (!host) return '';

	host = host.replace(/^https?:\/\//, '');
	host = host.split('/')[0] ?? '';
	host = host.replace(/:\d+$/, '');
	host = host.replace(/^\*\./, '').replace(/\.$/, '');

	if (host.startsWith('www.')) host = host.slice(4);

	return host;
};

export const hostname_from_url = (url: string): string => {
	try {
		return normalize_hostname(new URL(url).hostname);
	} catch {
		return '';
	}
};

export const registrable_domain = (hostname: string): string => {
	const host = normalize_hostname(hostname);
	if (!host) return '';

	const parts = host.split('.').filter(Boolean);
	if (parts.length <= 2) return parts.join('.');

	const last_two = parts.slice(-2).join('.');
	if (MULTI_PART_PUBLIC_SUFFIXES.has(last_two) && parts.length >= 3) {
		return parts.slice(-3).join('.');
	}

	return last_two;
};

export const domain_matches_rule = (
	domain: string,
	rule: string,
): boolean => {
	const normalized_domain = normalize_hostname(domain);
	const normalized_rule = normalize_hostname(rule);
	if (!normalized_domain || !normalized_rule) return false;

	return (
		normalized_domain === normalized_rule ||
		normalized_domain.endsWith(`.${normalized_rule}`)
	);
};

export const extract_domain_constraints = (
	query: string,
	include_domains?: string[],
): string[] => {
	const from_site = parse_search_operators(query)
		.operators.filter((operator) => operator.type === 'site')
		.map((operator) => normalize_hostname(operator.value))
		.filter(Boolean);
	const from_include = (include_domains ?? [])
		.map(normalize_hostname)
		.filter(Boolean);

	return [...new Set([...from_site, ...from_include])].sort();
};

export const filter_spam_results = <T extends { url: string }>(
	results: T[],
	extra_blocked: string[] = [],
	allowed: string[] = [],
): { kept: T[]; removed: string[] } => {
	const blocked_rules = [
		...SPAM_MIRROR_DOMAINS,
		...extra_blocked.map(normalize_hostname).filter(Boolean),
	];
	const allowed_rules = allowed
		.map(normalize_hostname)
		.filter(Boolean);
	const kept: T[] = [];
	const removed_domains: string[] = [];

	for (const item of results) {
		const domain = hostname_from_url(item.url);
		const is_allowed = allowed_rules.some((rule) =>
			domain_matches_rule(domain, rule),
		);
		const is_blocked = blocked_rules.some((rule) =>
			domain_matches_rule(domain, rule),
		);

		if (domain && !is_allowed && is_blocked) {
			removed_domains.push(domain);
			continue;
		}

		kept.push(item);
	}

	return {
		kept,
		removed: [...new Set(removed_domains)].sort(),
	};
};

export const rerank_domain_diversity = <T extends { url: string }>(
	results: T[],
	max_per_domain = 2,
): { results: T[]; demoted: number } => {
	if (max_per_domain < 1 || results.length < 3) {
		return { results, demoted: 0 };
	}

	const head: T[] = [];
	const overflow: T[] = [];
	const per_domain = new Map<string, number>();

	for (const item of results) {
		const host = hostname_from_url(item.url);
		const domain = host ? registrable_domain(host) : '';
		if (!domain) {
			head.push(item);
			continue;
		}

		const count = per_domain.get(domain) ?? 0;
		if (count >= max_per_domain) {
			overflow.push(item);
			continue;
		}

		per_domain.set(domain, count + 1);
		head.push(item);
	}

	return {
		results: [...head, ...overflow],
		demoted: overflow.length,
	};
};

const empty_spam_filtered = (): SpamFilteredMetadata => ({
	removed_count: 0,
	domains: [],
	demoted_count: 0,
});

export const apply_search_quality = <T extends { url: string }>(
	results: T[],
	options: SearchQualityOptions = {},
): SearchQualityResult<T> => {
	const filter_spam = options.filter_spam ?? true;
	const max_per_domain = options.max_results_per_domain ?? 2;
	const constraints = extract_domain_constraints(
		options.query ?? '',
		options.include_domains,
	);
	const allowed = [
		...(options.allowed_domains ?? []),
		...constraints,
	];

	let kept = results;
	let removed: string[] = [];
	let removed_count = 0;
	let demoted = 0;

	if (filter_spam) {
		const filtered = filter_spam_results(
			kept,
			options.blocked_domains,
			allowed,
		);
		removed_count = kept.length - filtered.kept.length;
		kept = filtered.kept;
		removed = filtered.removed;
	}

	if (constraints.length === 0 && max_per_domain > 0) {
		const reranked = rerank_domain_diversity(kept, max_per_domain);
		kept = reranked.results;
		demoted = reranked.demoted;
	}

	return {
		results: kept,
		metadata: {
			spam_filtered: {
				...empty_spam_filtered(),
				removed_count,
				domains: removed,
				demoted_count: demoted,
			},
		},
	};
};
