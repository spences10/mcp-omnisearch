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

export const country_schema = v.optional(
	v.pipe(
		v.string(),
		v.regex(
			/^[A-Za-z]{2}$/,
			'Country must be an ISO 3166-1 alpha-2 code',
		),
		v.description(
			'ISO 3166-1 alpha-2 country code (e.g. at, de, ch). Overrides OMNISEARCH_COUNTRY. Query language never changes country.',
		),
	),
);

export const language_schema = v.optional(
	v.pipe(
		v.string(),
		v.regex(
			/^(?:auto|[A-Za-z]{2})$/i,
			'Language must be an ISO 639-1 code or auto',
		),
		v.description(
			'ISO 639-1 language code or auto. Overrides OMNISEARCH_LANGUAGE. auto enables conservative query-language inference.',
		),
	),
);

export const exclude_domains_schema = v.optional(
	v.pipe(
		v.array(domain_schema),
		v.maxLength(20, 'Use at most 20 excluded domains'),
		v.description('Exclude results from these domains'),
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
