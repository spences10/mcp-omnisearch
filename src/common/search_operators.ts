export interface SearchOperator {
	type:
		| 'site'
		| 'exclude_site'
		| 'filetype'
		| 'ext'
		| 'intitle'
		| 'inurl'
		| 'inbody'
		| 'inpage'
		| 'language'
		| 'location'
		| 'before'
		| 'after'
		| 'exact'
		| 'force_include'
		| 'exclude_term'
		| 'boolean';
	value: string;
	original_text: string;
}

export interface ParsedQuery {
	base_query: string;
	operators: SearchOperator[];
}

const operator_patterns = {
	site: /site:([^\s]+)/g,
	exclude_site: /-site:([^\s]+)/g,
	filetype: /filetype:([^\s]+)/g,
	ext: /ext:([^\s]+)/g,
	intitle: /intitle:([^\s]+)/g,
	inurl: /inurl:([^\s]+)/g,
	inbody: /inbody:"?([^"\s]+)"?/g,
	inpage: /inpage:"?([^"\s]+)"?/g,
	language: /(?:lang|language):([^\s]+)/g,
	location: /(?:loc|location):([^\s]+)/g,
	before: /before:(\d{4}(?:-\d{2}(?:-\d{2})?)?)/g,
	after: /after:(\d{4}(?:-\d{2}(?:-\d{2})?)?)/g,
	exact: /"([^"]+)"/g,
	force_include: /\+([^\s]+)/g,
	exclude_term: /-([^\s:]+)(?!\s*site:)/g,
	boolean: /\b(AND|OR|NOT)\b/g,
};

export const parse_search_operators = (
	query: string,
): ParsedQuery => {
	const operators: SearchOperator[] = [];
	let modified_query = query;

	Object.entries(operator_patterns).forEach(([type, pattern]) => {
		modified_query = modified_query.replace(
			pattern,
			(match, value) => {
				operators.push({
					type: type as SearchOperator['type'],
					value: value,
					original_text: match,
				});
				return '';
			},
		);
	});

	const base_query = modified_query.replace(/\s+/g, ' ').trim();

	return {
		base_query,
		operators,
	};
};

export interface SearchParams {
	query: string;
	include_domains?: string[];
	exclude_domains?: string[];
	file_type?: string;
	title_filter?: string;
	url_filter?: string;
	body_filter?: string;
	page_filter?: string;
	language?: string;
	location?: string;
	date_before?: string;
	date_after?: string;
	exact_phrases?: string[];
	force_include_terms?: string[];
	exclude_terms?: string[];
	boolean_operators?: {
		type: 'AND' | 'OR' | 'NOT';
		terms: string[];
	}[];
}

export const apply_search_operators = (
	parsed_query: ParsedQuery,
): SearchParams => {
	const params: SearchParams = {
		query: parsed_query.base_query,
	};

	for (const operator of parsed_query.operators) {
		switch (operator.type) {
			case 'site':
				params.include_domains = [
					...(params.include_domains || []),
					operator.value,
				];
				break;
			case 'exclude_site':
				params.exclude_domains = [
					...(params.exclude_domains || []),
					operator.value,
				];
				break;
			case 'filetype':
			case 'ext':
				params.file_type = operator.value;
				break;
			case 'intitle':
				params.title_filter = operator.value;
				break;
			case 'inurl':
				params.url_filter = operator.value;
				break;
			case 'inbody':
				params.body_filter = operator.value;
				break;
			case 'inpage':
				params.page_filter = operator.value;
				break;
			case 'language':
				params.language = operator.value;
				break;
			case 'location':
				params.location = operator.value;
				break;
			case 'before':
				params.date_before = operator.value;
				break;
			case 'after':
				params.date_after = operator.value;
				break;
			case 'exact':
				params.exact_phrases = [
					...(params.exact_phrases || []),
					operator.value,
				];
				break;
			case 'force_include':
				params.force_include_terms = [
					...(params.force_include_terms || []),
					operator.value,
				];
				break;
			case 'exclude_term':
				params.exclude_terms = [
					...(params.exclude_terms || []),
					operator.value,
				];
				break;
			case 'boolean':
				if (!params.boolean_operators) {
					params.boolean_operators = [];
				}
				params.boolean_operators.push({
					type: operator.value as 'AND' | 'OR' | 'NOT',
					terms: [],
				});
				break;
		}
	}

	return params;
};

export interface QueryBuildOptions {
	exclude_file_type?: boolean;
	exclude_dates?: boolean;
}

export const build_query_with_operators = (
	search_params: SearchParams,
	additional_include_domains?: string[],
	additional_exclude_domains?: string[],
	options?: QueryBuildOptions,
): string => {
	let query = search_params.query;
	const filters: string[] = [];

	const include_domains = [
		...(additional_include_domains ?? []),
		...(search_params.include_domains ?? []),
	];
	if (include_domains.length) {
		const domain_filter = include_domains
			.map((domain) => `site:${domain}`)
			.join(' OR ');
		filters.push(domain_filter);
	}

	const exclude_domains = [
		...(additional_exclude_domains ?? []),
		...(search_params.exclude_domains ?? []),
	];
	if (exclude_domains.length) {
		filters.push(
			...exclude_domains.map((domain) => `-site:${domain}`),
		);
	}

	if (search_params.file_type && !options?.exclude_file_type) {
		filters.push(`filetype:${search_params.file_type}`);
	}

	if (search_params.title_filter) {
		filters.push(`intitle:${search_params.title_filter}`);
	}

	if (search_params.url_filter) {
		filters.push(`inurl:${search_params.url_filter}`);
	}

	if (search_params.body_filter) {
		filters.push(`inbody:${search_params.body_filter}`);
	}

	if (search_params.page_filter) {
		filters.push(`inpage:${search_params.page_filter}`);
	}

	if (search_params.language) {
		filters.push(`lang:${search_params.language}`);
	}

	if (search_params.location) {
		filters.push(`loc:${search_params.location}`);
	}

	if (search_params.date_before && !options?.exclude_dates) {
		filters.push(`before:${search_params.date_before}`);
	}
	if (search_params.date_after && !options?.exclude_dates) {
		filters.push(`after:${search_params.date_after}`);
	}

	if (search_params.exact_phrases?.length) {
		filters.push(
			...search_params.exact_phrases.map((phrase) => `"${phrase}"`),
		);
	}

	if (search_params.force_include_terms?.length) {
		filters.push(
			...search_params.force_include_terms.map((term) => `+${term}`),
		);
	}

	if (search_params.exclude_terms?.length) {
		filters.push(
			...search_params.exclude_terms.map((term) => `-${term}`),
		);
	}

	if (filters.length > 0) {
		query = `${query} ${filters.join(' ')}`;
	}

	return query;
};
