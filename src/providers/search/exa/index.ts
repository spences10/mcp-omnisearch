import * as v from 'valibot';
import {
	handle_provider_error,
	sanitize_query,
} from '../../../common/errors.js';
import { http_json } from '../../../common/http.js';
import { parse_provider_response } from '../../../common/provider-response.js';
import { retry_with_backoff } from '../../../common/retry.js';
import {
	BaseSearchParams,
	SearchProvider,
	SearchResult,
} from '../../../common/types.js';
import { validate_api_key } from '../../../common/validation.js';
import { config } from '../../../config/env.js';

interface ExaSearchRequest {
	query: string;
	type?: string;
	numResults?: number;
	includeDomains?: string[];
	excludeDomains?: string[];
	contents?: {
		text?: { maxCharacters?: number };
	};
	category?: string;
}

const exa_search_response_schema = v.object({
	requestId: v.string(),
	autopromptString: v.nullish(v.string()),
	resolvedSearchType: v.nullish(v.string()),
	searchType: v.nullish(v.string()),
	results: v.array(
		v.object({
			id: v.string(),
			title: v.string(),
			url: v.string(),
			publishedDate: v.nullish(v.string()),
			author: v.nullish(v.string()),
			text: v.nullish(v.string()),
			score: v.nullish(v.number()),
			highlights: v.nullish(v.array(v.string())),
			summary: v.nullish(v.string()),
		}),
	),
});

export class ExaSearchProvider implements SearchProvider {
	name = 'exa';
	description =
		'AI-powered web search using neural and keyword search. Optimized for AI applications with semantic understanding, content extraction, and research capabilities.';

	async search(params: BaseSearchParams): Promise<SearchResult[]> {
		const api_key = validate_api_key(
			config.search.exa.api_key,
			this.name,
		);

		const search_request = async () => {
			try {
				const request_body: ExaSearchRequest = {
					query: sanitize_query(params.query),
					type: 'auto', // Let Exa choose between neural and keyword search
					numResults: params.limit ?? 10,
					contents: {
						text: { maxCharacters: 3000 },
					},
				};

				// Add domain filtering if provided
				if (
					params.include_domains &&
					params.include_domains.length > 0
				) {
					request_body.includeDomains = params.include_domains;
				}
				if (
					params.exclude_domains &&
					params.exclude_domains.length > 0
				) {
					request_body.excludeDomains = params.exclude_domains;
				}

				const raw_data = await http_json(
					this.name,
					`${config.search.exa.base_url}/search`,
					{
						method: 'POST',
						headers: {
							// Exa accepts either x-api-key or Authorization Bearer
							'x-api-key': api_key,
							Authorization: `Bearer ${api_key}`,
							'Content-Type': 'application/json',
						},
						body: JSON.stringify(request_body),
					},
				);

				const data = parse_provider_response(
					this.name,
					exa_search_response_schema,
					raw_data,
				);

				return data.results.map((result) => ({
					title: result.title,
					url: result.url,
					snippet:
						result.text || result.summary || 'No content available',
					score: result.score || 0,
					source_provider: this.name,
					metadata: {
						id: result.id,
						author: result.author ?? undefined,
						publishedDate: result.publishedDate ?? undefined,
						highlights: result.highlights ?? undefined,
						autopromptString: data.autopromptString ?? undefined,
						resolvedSearchType:
							data.resolvedSearchType ?? data.searchType,
					},
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
