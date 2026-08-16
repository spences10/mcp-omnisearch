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

export const max_providers_schema = v.optional(
	v.pipe(
		v.number(),
		v.integer('max_providers must be an integer'),
		v.minValue(1, 'max_providers must be at least 1'),
		v.maxValue(20, 'max_providers must be at most 20'),
		v.description(
			'Maximum providers to run for a multi-provider plan (default: 3). Ignored for single-provider calls.',
		),
	),
);

export const timeout_seconds_schema = v.optional(
	v.pipe(
		v.number(),
		v.integer('timeout_seconds must be an integer'),
		v.minValue(1, 'timeout_seconds must be at least 1'),
		v.maxValue(120, 'timeout_seconds must be at most 120'),
		v.description(
			'Whole-call timeout in seconds for multi-provider fan-out (default: 20). Ignored for single-provider calls.',
		),
	),
);

export const budget_usd_schema = v.optional(
	v.pipe(
		v.number(),
		v.minValue(0, 'budget_usd must be at least 0'),
		v.description(
			'Optional estimated USD cap for a multi-provider plan. Impossible plans fail before any provider call. Ignored for single-provider calls.',
		),
	),
);

export const request_budget_schema_fields = {
	max_providers: max_providers_schema,
	timeout_seconds: timeout_seconds_schema,
	budget_usd: budget_usd_schema,
};
