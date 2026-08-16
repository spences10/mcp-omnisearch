import {
	handle_provider_error,
	sanitize_query,
} from '../../../common/errors.js';
import { http_json } from '../../../common/http.js';
import { retry_with_backoff } from '../../../common/retry.js';
import {
	BaseSearchParams,
	ErrorType,
	ProviderError,
	SearchProvider,
	SearchResult,
} from '../../../common/types.js';
import { validate_api_key } from '../../../common/validation.js';
import { config } from '../../../config/env.js';

export interface EnrichmentResponse {
	data: Array<{
		title?: string;
		url?: string;
		snippet?: string | null;
		rank?: number;
	}>;
	meta?: {
		total_hits?: number;
		api_balance?: number;
	};
}

const decode_enrichment_snippet = (snippet: string) =>
	snippet
		.replace(/&#39;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>');

const map_enrichment_results = (
	data: EnrichmentResponse['data'],
	provider: string,
): SearchResult[] =>
	data.flatMap((result): SearchResult[] => {
		if (!result.title || !result.url) return [];

		return [
			{
				title: result.title,
				url: result.url,
				snippet: decode_enrichment_snippet(result.snippet ?? ''),
				score: result.rank ? 1 / result.rank : undefined,
				source_provider: provider,
			},
		];
	});

export class KagiEnrichmentSearchProvider implements SearchProvider {
	name = 'kagi_enrichment';
	description =
		'Search specialized indexes (Teclis for web, TinyGem for news). Ideal for discovering non-mainstream results and supplementary knowledge.';

	async search(params: BaseSearchParams): Promise<SearchResult[]> {
		const api_key = validate_api_key(
			config.enhancement.kagi_enrichment.api_key,
			this.name,
		);

		const query = sanitize_query(params.query);
		const limit = params.limit ?? 5;

		const fetch_index = (index: 'web' | 'news') =>
			http_json<EnrichmentResponse & { message?: string }>(
				this.name,
				`${config.enhancement.kagi_enrichment.base_url}/${index}?${new URLSearchParams(
					{
						q: query,
						limit: String(limit),
					},
				)}`,
				{
					method: 'GET',
					headers: {
						Authorization: `Bot ${api_key}`,
						Accept: 'application/json',
					},
					signal: AbortSignal.timeout(
						config.enhancement.kagi_enrichment.timeout,
					),
				},
			);

		const enrich_request = async () => {
			try {
				if (params.search_type === 'news') {
					const news_data = await fetch_index('news');
					if (!news_data?.data) {
						throw new ProviderError(
							ErrorType.API_ERROR,
							'Unexpected response: missing data from enrichment endpoints',
							this.name,
						);
					}

					return map_enrichment_results(news_data.data, this.name);
				}

				const [web_data, news_data] = await Promise.all([
					fetch_index('web'),
					fetch_index('news'),
				]);

				if (!web_data?.data || !news_data?.data) {
					throw new ProviderError(
						ErrorType.API_ERROR,
						'Unexpected response: missing data from enrichment endpoints',
						this.name,
					);
				}

				return map_enrichment_results(
					[...web_data.data, ...news_data.data],
					this.name,
				);
			} catch (error) {
				handle_provider_error(error, this.name, 'enrich content');
			}
		};

		return retry_with_backoff(enrich_request);
	}
}
