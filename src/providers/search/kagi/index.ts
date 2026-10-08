import * as v from 'valibot';
import { handle_provider_error } from '../../../common/errors.js';
import { http_json } from '../../../common/http.js';
import { parse_provider_response } from '../../../common/provider-response.js';
import { retry_with_backoff } from '../../../common/retry.js';
import {
	apply_search_operators,
	build_query_with_operators,
	parse_search_operators,
} from '../../../common/search-operators.js';
import {
	BaseSearchParams,
	SearchProvider,
	SearchResult,
} from '../../../common/types.js';
import { validate_api_key } from '../../../common/validation.js';
import { config } from '../../../config/env.js';

const kagi_search_response_schema = v.object({
	data: v.nullish(
		v.object({
			search: v.optional(v.array(v.unknown())),
		}),
	),
});

const is_kagi_search_result = (
	result: unknown,
): result is {
	title: string;
	url: string;
	snippet?: string | null;
} =>
	typeof result === 'object' &&
	result !== null &&
	'title' in result &&
	'url' in result &&
	typeof result.title === 'string' &&
	typeof result.url === 'string' &&
	(!('snippet' in result) ||
		typeof result.snippet === 'string' ||
		result.snippet === null);

// Kagi wraps matched terms in <strong> and HTML-encodes snippets
const clean_snippet = (snippet: string) =>
	snippet
		.replace(/<\/?strong>/g, '')
		.replace(/&#39;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&amp;/g, '&');

export class KagiSearchProvider implements SearchProvider {
	name = 'kagi';
	description =
		'High-quality search with operators: site:, -site:, filetype:/ext:, intitle:, inurl:, inbody:, inpage:, lang:, loc:, before:, after:, +term, -term, "exact". Privacy-focused with specialized knowledge indexes. Best for research and technical documentation.';

	async search(params: BaseSearchParams): Promise<SearchResult[]> {
		const api_key = validate_api_key(
			config.search.kagi.api_key,
			this.name,
		);

		// Parse search operators from the query
		const parsed_query = parse_search_operators(params.query);
		const search_params = apply_search_operators(parsed_query);

		const search_request = async () => {
			try {
				// Build query with all operators using shared utility
				// Kagi handles operators natively in the query string
				const query = build_query_with_operators(
					search_params,
					params.include_domains,
					params.exclude_domains,
				);

				const raw_data = await http_json(
					this.name,
					`${config.search.kagi.base_url}/search`,
					{
						method: 'POST',
						headers: {
							Authorization: `Bearer ${api_key}`,
							'Content-Type': 'application/json',
							Accept: 'application/json',
						},
						body: JSON.stringify({
							query,
							limit: params.limit ?? 10,
						}),
						signal: AbortSignal.timeout(config.search.kagi.timeout),
					},
				);

				const data = parse_provider_response(
					this.name,
					kagi_search_response_schema,
					raw_data,
				);

				return (data.data?.search ?? [])
					.filter(is_kagi_search_result)
					.map((result) => ({
						title: result.title,
						url: result.url,
						snippet: clean_snippet(result.snippet ?? ''),
						source_provider: this.name,
					}));
			} catch (error) {
				handle_provider_error(
					error,
					this.name,
					'fetch search results',
				);
			}
		};

		return retry_with_backoff(search_request);
	}
}
