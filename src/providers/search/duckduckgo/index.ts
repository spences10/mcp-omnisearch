import {
	BaseSearchParams,
	ErrorType,
	ProviderError,
	SearchProvider,
	SearchResult,
} from '../../../common/types.js';
import {
	apply_search_operators,
	handle_rate_limit,
	parse_search_operators,
	retry_with_backoff,
	sanitize_query,
} from '../../../common/utils.js';
import { config } from '../../../config/env.js';

interface DuckDuckGoSearchResponse {
	results: Array<{
		title: string;
		href: string;
		body: string;
	}>;
}

export class DuckDuckGoSearchProvider implements SearchProvider {
	name = 'duckduckgo';
	description =
		'Privacy-focused search engine that does not track users or store personal information. Provides unbiased search results without personalization bubbles. Supports basic search operators and domain filtering. Free to use without API key requirements. Best for privacy-conscious searches and getting diverse, unfiltered results.';

	async search(params: BaseSearchParams): Promise<SearchResult[]> {
		// Parse search operators from the query
		const parsed_query = parse_search_operators(params.query);
		const search_params = apply_search_operators(parsed_query);

		const search_request = async () => {
			try {
				let query = sanitize_query(search_params.query);

				// Handle domain filters using query string operators
				const include_domains = [
					...(params.include_domains ?? []),
					...(search_params.include_domains ?? []),
				];
				if (include_domains.length) {
					const domain_filter = include_domains
						.map((domain) => `site:${domain}`)
						.join(' OR ');
					query = `${query} (${domain_filter})`;
				}

				const exclude_domains = [
					...(params.exclude_domains ?? []),
					...(search_params.exclude_domains ?? []),
				];
				if (exclude_domains.length) {
					query = `${query} ${exclude_domains
						.map((domain) => `-site:${domain}`)
						.join(' ')}`;
				}

				// Add file type filter
				if (search_params.file_type) {
					query += ` filetype:${search_params.file_type}`;
				}

				// Add time range filters
				if (search_params.date_before || search_params.date_after) {
					if (search_params.date_after) {
						query += ` after:${search_params.date_after}`;
					}
					if (search_params.date_before) {
						query += ` before:${search_params.date_before}`;
					}
				}

				// Add title and URL filters
				if (search_params.title_filter) {
					query += ` intitle:${search_params.title_filter}`;
				}
				if (search_params.url_filter) {
					query += ` inurl:${search_params.url_filter}`;
				}

				// Add exact phrases
				if (search_params.exact_phrases?.length) {
					query += ` ${search_params.exact_phrases
						.map((phrase) => `"${phrase}"`)
						.join(' ')}`;
				}

				const search_url = new URL('https://html.duckduckgo.com/html/');
				search_url.searchParams.set('q', query);
				search_url.searchParams.set('kl', config.search.duckduckgo.region);
				search_url.searchParams.set('safe', config.search.duckduckgo.safesearch);

				const response = await fetch(search_url.toString(), {
					method: 'GET',
					headers: {
						'User-Agent': 'Mozilla/5.0 (compatible; MCPOmnisearch/1.0)',
						Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
						'Accept-Language': 'en-US,en;q=0.5',
						'Accept-Encoding': 'gzip, deflate',
						DNT: '1',
						Connection: 'keep-alive',
						'Upgrade-Insecure-Requests': '1',
					},
					signal: AbortSignal.timeout(config.search.duckduckgo.timeout),
				});

				if (!response.ok) {
					switch (response.status) {
						case 429:
							handle_rate_limit(this.name);
						case 403:
							throw new ProviderError(
								ErrorType.API_ERROR,
								'Access forbidden - possible rate limiting',
								this.name,
							);
						case 500:
							throw new ProviderError(
								ErrorType.PROVIDER_ERROR,
								'DuckDuckGo search internal error',
								this.name,
							);
						default:
							throw new ProviderError(
								ErrorType.API_ERROR,
								`HTTP ${response.status}: ${response.statusText}`,
								this.name,
							);
					}
				}

				const html = await response.text();
				const results = this.parseSearchResults(html, params.limit ?? 10);

				return results;
			} catch (error) {
				if (error instanceof ProviderError) {
					throw error;
				}
				throw new ProviderError(
					ErrorType.API_ERROR,
					`Failed to fetch: ${
						error instanceof Error ? error.message : 'Unknown error'
					}`,
					this.name,
				);
			}
		};

		return retry_with_backoff(search_request);
	}

	private parseSearchResults(html: string, limit: number): SearchResult[] {
		const results: SearchResult[] = [];

		// Simple regex-based parsing for DuckDuckGo HTML results
		// This matches the typical structure of DuckDuckGo search results
		const resultPattern = /<div class="result__body">[\s\S]*?<a.*?href="([^"]*)".*?>(.*?)<\/a>[\s\S]*?<a.*?class="result__snippet".*?>(.*?)<\/a>[\s\S]*?<\/div>/gi;

		let match;
		let count = 0;

		while ((match = resultPattern.exec(html)) !== null && count < limit) {
			const url = this.decodeUrl(match[1]);
			const title = this.cleanHtml(match[2]);
			const snippet = this.cleanHtml(match[3]);

			if (url && title && snippet) {
				results.push({
					title,
					url,
					snippet,
					score: count + 1,
					source_provider: this.name,
				});
				count++;
			}
		}

		// Fallback parsing method if the above doesn't work
		if (results.length === 0) {
			const fallbackPattern = /<h2 class="result__title">[\s\S]*?<a.*?href="([^"]*)"[^>]*>(.*?)<\/a>[\s\S]*?<div class="result__snippet"[^>]*>(.*?)<\/div>/gi;

			while ((match = fallbackPattern.exec(html)) !== null && count < limit) {
				const url = this.decodeUrl(match[1]);
				const title = this.cleanHtml(match[2]);
				const snippet = this.cleanHtml(match[3]);

				if (url && title && snippet) {
					results.push({
						title,
						url,
						snippet,
						score: count + 1,
						source_provider: this.name,
					});
					count++;
				}
			}
		}

		return results;
	}

	private decodeUrl(url: string): string {
		try {
			// DuckDuckGo URLs are often encoded, so we need to decode them
			const decodedUrl = decodeURIComponent(url);
			
			// Handle DuckDuckGo redirect URLs
			if (decodedUrl.includes('/l/?uddg=')) {
				const urlParam = new URL(decodedUrl).searchParams.get('uddg');
				return urlParam ? decodeURIComponent(urlParam) : decodedUrl;
			}
			
			return decodedUrl;
		} catch {
			return url;
		}
	}

	private cleanHtml(html: string): string {
		return html
			.replace(/<[^>]*>/g, '') // Remove HTML tags
			.replace(/&amp;/g, '&')
			.replace(/&lt;/g, '<')
			.replace(/&gt;/g, '>')
			.replace(/&quot;/g, '"')
			.replace(/&#39;/g, "'")
			.replace(/&nbsp;/g, ' ')
			.replace(/\s+/g, ' ')
			.trim();
	}
}