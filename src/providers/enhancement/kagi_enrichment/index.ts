import {
	handle_provider_error,
	sanitize_query,
} from '../../../common/errors.js';
import { http_json } from '../../../common/http.js';
import { retry_with_backoff } from '../../../common/retry.js';
import {
	ErrorType,
	ProviderError,
	SearchProvider,
	SearchResult,
} from '../../../common/types.js';
import { validate_api_key } from '../../../common/validation.js';
import { config } from '../../../config/env.js';

export interface EnrichmentResponse {
	data: Array<{
		title: string;
		url: string;
		snippet: string;
		rank?: number;
	}>;
	meta?: {
		total_hits: number;
		api_balance?: number;
	};
}

export class KagiEnrichmentSearchProvider implements SearchProvider {
	name = 'kagi_enrichment';
	description =
		'Search specialized indexes (Teclis for web, TinyGem for news). Ideal for discovering non-mainstream results and supplementary knowledge.';

	async search(params: {
		query: string;
		limit?: number;
	}): Promise<SearchResult[]> {
		const api_key = validate_api_key(
			config.enhancement.kagi_enrichment.api_key,
			this.name,
		);

		const query = sanitize_query(params.query);
		const limit = params.limit ?? 5;

		const enrich_request = async () => {
			try {
				const [webData, newsData] = await Promise.all([
					http_json<EnrichmentResponse & { message?: string }>(
						this.name,
						`https://kagi.com/api/v0/enrich/web?${new URLSearchParams(
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
					),
					http_json<EnrichmentResponse & { message?: string }>(
						this.name,
						`https://kagi.com/api/v0/enrich/news?${new URLSearchParams(
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
					),
				]);

				if (!webData?.data || !newsData?.data) {
					throw new ProviderError(
						ErrorType.API_ERROR,
						'Unexpected response: missing data from enrichment endpoints',
						this.name,
					);
				}

				const allData = [...webData.data, ...newsData.data];

				return allData
					.map((result) => ({
						title: result.title,
						url: result.url,
						snippet: result.snippet
							?.replace(/&#39;/g, "'")
							.replace(/&quot;/g, '"')
							.replace(/&amp;/g, '&')
							.replace(/&lt;/g, '<')
							.replace(/&gt;/g, '>'),
						score: result.rank ? 1 / result.rank : undefined,
						source_provider: this.name,
					}))
					.filter((r) => r.title && r.url && r.snippet);
			} catch (error) {
				handle_provider_error(error, this.name, 'enrich content');
			}
		};

		return retry_with_backoff(enrich_request);
	}
}
