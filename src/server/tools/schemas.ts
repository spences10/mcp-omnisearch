import * as v from 'valibot';

const DOMAIN_PATTERN =
	/^(?:\*\.)?(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}$/;

export const query_schema = v.pipe(
	v.string(),
	v.minLength(1, 'Query cannot be empty'),
	v.regex(/\S/, 'Query cannot be empty'),
	v.description('Search query'),
);

export const limit_schema = v.optional(
	v.pipe(
		v.number(),
		v.integer('Limit must be an integer'),
		v.minValue(1, 'Limit must be at least 1'),
		v.maxValue(50, 'Limit must be at most 50'),
		v.description('Maximum number of results (default: 10)'),
	),
);

export const large_result_mode_schema = v.optional(
	v.pipe(
		v.picklist(['inline', 'file']),
		v.description(
			'How to handle oversized responses for this request. Use inline for remote/container transports; file is local shared-filesystem behavior. Defaults to OMNISEARCH_LARGE_RESULT_MODE or file.',
		),
	),
);

export const include_raw_contents_schema = v.optional(
	v.pipe(
		v.boolean(),
		v.description(
			'Whether extraction responses should include per-URL raw_contents alongside combined content (default: true).',
		),
	),
);

export const domain_schema = v.pipe(
	v.string(),
	v.regex(DOMAIN_PATTERN, 'Domain must be a hostname, not a URL'),
);

export const include_domains_schema = v.optional(
	v.pipe(
		v.array(domain_schema),
		v.maxLength(20, 'Use at most 20 included domains'),
		v.description('Only return results from these domains'),
	),
);

export const exclude_domains_schema = v.optional(
	v.pipe(
		v.array(domain_schema),
		v.maxLength(20, 'Use at most 20 excluded domains'),
		v.description('Exclude results from these domains'),
	),
);

export const filter_spam_schema = v.optional(
	v.pipe(
		v.boolean(),
		v.description(
			'Drop known content mirrors and SEO scrapers. Defaults to OMNISEARCH_FILTER_SPAM or true. site: and include_domains keep those hosts.',
		),
	),
);

export const max_results_per_domain_schema = v.optional(
	v.pipe(
		v.number(),
		v.integer('max_results_per_domain must be an integer'),
		v.minValue(0, 'max_results_per_domain must be at least 0'),
		v.maxValue(50, 'max_results_per_domain must be at most 50'),
		v.description(
			'Keep this many results per registrable domain in place; overflow moves behind. 0 disables. Defaults to OMNISEARCH_MAX_RESULTS_PER_DOMAIN or 2. Skipped for site: and include_domains queries.',
		),
	),
);

export const blocked_domains_schema = v.optional(
	v.pipe(
		v.array(domain_schema),
		v.maxLength(50, 'Use at most 50 extra blocked domains'),
		v.description(
			'Additional mirror or scraper domains to drop. Merged with OMNISEARCH_BLOCKED_DOMAINS.',
		),
	),
);

export const allowed_domains_schema = v.optional(
	v.pipe(
		v.array(domain_schema),
		v.maxLength(50, 'Use at most 50 allowed domains'),
		v.description(
			'Keep these domains even if they appear on the spam/mirror blocklist. Merged with OMNISEARCH_ALLOWED_DOMAINS.',
		),
	),
);

export const http_url_schema = v.pipe(
	v.string(),
	v.url('URL must be valid'),
	v.regex(/^https?:\/\//, 'URL protocol must be http or https'),
);

export const url_or_urls_schema = v.pipe(
	v.union([
		http_url_schema,
		v.pipe(
			v.array(http_url_schema),
			v.minLength(1, 'Provide at least one URL'),
			v.maxLength(10, 'Use at most 10 URLs per extraction'),
		),
	]),
	v.description('URL or array of URLs to process'),
);
