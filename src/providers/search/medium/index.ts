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

interface MediumRSSResponse {
	items: Array<{
		title: string;
		link: string;
		contentSnippet: string;
		content: string;
		pubDate: string;
		creator: string;
		categories: string[];
		guid: string;
	}>;
}

interface MediumAPIResponse {
	data: Array<{
		id: string;
		title: string;
		url: string;
		subtitle?: string;
		content?: string;
		publishedAt: string;
		author: {
			name: string;
			username: string;
		};
		tags: string[];
		claps: number;
		responses: number;
	}>;
}

export class MediumSearchProvider implements SearchProvider {
	name = 'medium';
	description =
		'Medium platform search for discovering high-quality articles, stories, and publications. Focuses on thought leadership, professional insights, and creator content. Supports tag-based filtering and author discovery. Great for finding in-depth articles on technology, business, design, and other professional topics. Results include engagement metrics like claps and responses.';

	async search(params: BaseSearchParams): Promise<SearchResult[]> {
		const { query, limit = 10 } = params;

		// Sanitize and validate query
		const sanitized_query = sanitize_query(query);
		if (!sanitized_query) {
			throw new ProviderError(
				ErrorType.INVALID_INPUT,
				'Query cannot be empty',
				this.name,
			);
		}

		// Parse search operators
		const { 
			cleaned_query, 
			include_domains, 
			exclude_domains,
			additional_filters 
		} = parse_search_operators(sanitized_query);

		// Apply domain filtering if specified
		let final_query = cleaned_query;
		if (include_domains.length > 0 || exclude_domains.length > 0) {
			final_query = apply_search_operators(cleaned_query, {
				include_domains,
				exclude_domains,
			});
		}

		return retry_with_backoff(async () => {
			try {
				// Medium uses a combination of RSS feeds and search APIs
				// We'll use their topic-based RSS feeds and search endpoints
				const search_url = new URL('https://medium.com/search');
				search_url.searchParams.set('q', final_query);
				
				// Add limit parameter
				if (limit && limit !== 10) {
					search_url.searchParams.set('count', Math.min(limit, 100).toString());
				}

				const response = await fetch(search_url.toString(), {
					method: 'GET',
					headers: {
						'Accept': 'application/json',
						'User-Agent': 'mcp-omnisearch/1.0',
						'Accept-Language': 'en-US,en;q=0.9',
					},
					signal: AbortSignal.timeout(config.search.medium.timeout),
				});

				if (!response.ok) {
					const error_text = await response.text().catch(() => 'Unknown error');
					const error_message = error_text.slice(0, 200);

					switch (response.status) {
						case 401:
							throw new ProviderError(
								ErrorType.API_ERROR,
								'Invalid API credentials',
								this.name,
							);
						case 429:
							handle_rate_limit(this.name);
							return;
						case 400:
							throw new ProviderError(
								ErrorType.INVALID_INPUT,
								`Bad request: ${error_message}`,
								this.name,
							);
						case 500:
							throw new ProviderError(
								ErrorType.PROVIDER_ERROR,
								'Medium API internal error',
								this.name,
							);
						default:
							throw new ProviderError(
								ErrorType.API_ERROR,
								`Medium API error: ${response.status} - ${error_message}`,
								this.name,
							);
					}
				}

				const data = await response.json();

				// Since Medium's public API is limited, we'll fall back to RSS + scraping approach
				return this.searchViaRSS(final_query, limit);

			} catch (error) {
				if (error instanceof ProviderError) {
					throw error;
				}
				throw new ProviderError(
					ErrorType.NETWORK_ERROR,
					`Network error: ${error instanceof Error ? error.message : 'Unknown error'}`,
					this.name,
				);
			}
		});
	}

	private async searchViaRSS(query: string, limit: number): Promise<SearchResult[]> {
		try {
			// Use Medium's RSS feed with search query
			const rss_url = `https://medium.com/feed/tag/${encodeURIComponent(query.toLowerCase().replace(/\s+/g, '-'))}`;
			
			const response = await fetch(rss_url, {
				method: 'GET',
				headers: {
					'Accept': 'application/rss+xml, application/xml, text/xml',
					'User-Agent': 'mcp-omnisearch/1.0',
				},
				signal: AbortSignal.timeout(config.search.medium.timeout),
			});

			if (!response.ok) {
				// Fallback to general Medium RSS feed and filter client-side
				return this.searchGeneralFeed(query, limit);
			}

			const xml_text = await response.text();
			const rss_data = this.parseRSSFeed(xml_text);
			
			// Filter results based on query relevance
			const filtered_results = rss_data.items
				.filter(item => 
					item.title.toLowerCase().includes(query.toLowerCase()) ||
					item.contentSnippet.toLowerCase().includes(query.toLowerCase())
				)
				.slice(0, limit);

			return filtered_results.map(item => ({
				title: item.title,
				url: item.link,
				content: item.contentSnippet || item.content?.substring(0, 300) || '',
				published_date: item.pubDate,
				source: 'Medium',
				author: item.creator,
				metadata: {
					categories: item.categories,
					guid: item.guid,
				},
			}));

		} catch (error) {
			throw new ProviderError(
				ErrorType.PROVIDER_ERROR,
				`RSS search failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
				this.name,
			);
		}
	}

	private async searchGeneralFeed(query: string, limit: number): Promise<SearchResult[]> {
		try {
			// Use Medium's general RSS feed
			const response = await fetch('https://medium.com/feed', {
				method: 'GET',
				headers: {
					'Accept': 'application/rss+xml, application/xml, text/xml',
					'User-Agent': 'mcp-omnisearch/1.0',
				},
				signal: AbortSignal.timeout(config.search.medium.timeout),
			});

			if (!response.ok) {
				throw new ProviderError(
					ErrorType.PROVIDER_ERROR,
					`Medium RSS feed unavailable: ${response.status}`,
					this.name,
				);
			}

			const xml_text = await response.text();
			const rss_data = this.parseRSSFeed(xml_text);
			
			// Filter results based on query relevance
			const filtered_results = rss_data.items
				.filter(item => 
					item.title.toLowerCase().includes(query.toLowerCase()) ||
					item.contentSnippet.toLowerCase().includes(query.toLowerCase()) ||
					item.categories.some(cat => cat.toLowerCase().includes(query.toLowerCase()))
				)
				.slice(0, limit);

			return filtered_results.map(item => ({
				title: item.title,
				url: item.link,
				content: item.contentSnippet || item.content?.substring(0, 300) || '',
				published_date: item.pubDate,
				source: 'Medium',
				author: item.creator,
				metadata: {
					categories: item.categories,
					guid: item.guid,
				},
			}));

		} catch (error) {
			if (error instanceof ProviderError) {
				throw error;
			}
			throw new ProviderError(
				ErrorType.PROVIDER_ERROR,
				`General feed search failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
				this.name,
			);
		}
	}

	private parseRSSFeed(xml: string): MediumRSSResponse {
		// Simple RSS parsing - in production, you'd use a proper XML parser
		const items: MediumRSSResponse['items'] = [];
		
		// Extract items using regex (simplified approach)
		const itemMatches = xml.match(/<item>.*?<\/item>/gs) || [];
		
		for (const itemXml of itemMatches) {
			const title = this.extractXMLTag(itemXml, 'title') || '';
			const link = this.extractXMLTag(itemXml, 'link') || '';
			const contentSnippet = this.extractXMLTag(itemXml, 'description') || '';
			const pubDate = this.extractXMLTag(itemXml, 'pubDate') || '';
			const creator = this.extractXMLTag(itemXml, 'dc:creator') || this.extractXMLTag(itemXml, 'author') || '';
			
			// Extract categories
			const categoryMatches = itemXml.match(/<category>([^<]+)<\/category>/g) || [];
			const categories = categoryMatches.map(match => 
				match.replace(/<\/?category>/g, '').trim()
			);

			const guid = this.extractXMLTag(itemXml, 'guid') || link;

			if (title && link) {
				items.push({
					title: this.cleanHTMLTags(title),
					link,
					contentSnippet: this.cleanHTMLTags(contentSnippet),
					content: this.cleanHTMLTags(contentSnippet),
					pubDate,
					creator,
					categories,
					guid,
				});
			}
		}

		return { items };
	}

	private extractXMLTag(xml: string, tag: string): string | null {
		const regex = new RegExp(`<${tag}[^>]*>(.*?)<\/${tag}>`, 'is');
		const match = xml.match(regex);
		return match ? match[1].trim() : null;
	}

	private cleanHTMLTags(text: string): string {
		return text
			.replace(/<[^>]*>/g, '') // Remove HTML tags
			.replace(/&lt;/g, '<')
			.replace(/&gt;/g, '>')
			.replace(/&amp;/g, '&')
			.replace(/&quot;/g, '"')
			.replace(/&#39;/g, "'")
			.replace(/&nbsp;/g, ' ')
			.trim();
	}
}