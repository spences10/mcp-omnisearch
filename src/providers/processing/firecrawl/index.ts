import { AbstractProcessingProvider } from '../../../common/abstract-processing-provider.js';
import {
	ErrorType,
	ProcessingResult,
	ProviderError,
} from '../../../common/types.js';
import { config } from '../../../config/env.js';

export type FirecrawlMode =
	| 'scrape'
	| 'crawl'
	| 'map'
	| 'extract'
	| 'actions';

interface FirecrawlScrapeResponse {
	success: boolean;
	data?: {
		markdown?: string;
		html?: string;
		rawHtml?: string;
		screenshot?: string;
		links?: string[];
		metadata?: {
			title?: string;
			description?: string;
			language?: string;
			sourceURL?: string;
			statusCode?: number;
			error?: string;
			[key: string]: any;
		};
		llm_extraction?: any;
		warning?: string;
	};
	error?: string;
}

interface FirecrawlAsyncResponse {
	success: boolean;
	id: string;
	url: string;
	error?: string;
}

interface FirecrawlStatusResponse {
	success: boolean;
	id: string;
	status: string;
	total?: number;
	data?: Array<{
		url: string;
		markdown?: string;
		html?: string;
		rawHtml?: string;
		metadata?: {
			title?: string;
			description?: string;
			language?: string;
			sourceURL?: string;
			statusCode?: number;
			error?: string;
			[key: string]: any;
		};
		error?: string;
	}>;
	error?: string;
}

interface FirecrawlMapResponse {
	success: boolean;
	links?: string[];
	error?: string;
}

export class FirecrawlProvider extends AbstractProcessingProvider {
	readonly name: string;
	readonly description: string;
	private mode: FirecrawlMode;

	constructor(mode: FirecrawlMode) {
		const mode_config = config.processing[
			`firecrawl_${mode}` as keyof typeof config.processing
		] as any;

		super(
			{
				api_key: mode_config.api_key,
				base_url: mode_config.base_url,
				timeout: mode_config.timeout,
				auth_type: 'bearer' as const,
			},
			`firecrawl_${mode}`,
			{
				allow_single_url: true,
				allow_multiple_urls: mode !== 'crawl', // Crawl only works with single URL
				max_urls: mode === 'crawl' ? 1 : 10,
			},
		);

		this.mode = mode;
		this.name = `firecrawl_${mode}`;
		this.description = this.get_mode_description(mode);
	}

	private get_mode_description(mode: FirecrawlMode): string {
		const descriptions = {
			scrape:
				'Extract clean, LLM-ready data from single URLs with enhanced formatting options using Firecrawl. Efficiently converts web content into markdown, plain text, or structured data with configurable extraction options. Best for content analysis, data collection, and AI training data preparation.',
			crawl:
				'Deep crawling of all accessible subpages on a website with configurable depth limits using Firecrawl. Efficiently discovers and extracts content from multiple pages within a domain. Best for comprehensive site analysis, content indexing, and data collection from entire websites.',
			map: 'Fast URL collection from websites for comprehensive site mapping using Firecrawl. Efficiently discovers all accessible URLs within a domain without extracting content. Best for site auditing, URL discovery, and preparing for targeted content extraction.',
			extract:
				'Structured data extraction with AI using natural language prompts via Firecrawl. Extracts specific information from web pages based on custom extraction instructions. Best for targeted data collection, information extraction, and converting unstructured web content into structured data.',
			actions:
				'Support for page interactions (clicking, scrolling, etc.) before extraction for dynamic content using Firecrawl. Enables extraction from JavaScript-heavy sites, single-page applications, and content behind user interactions. Best for accessing content that requires navigation, form filling, or other interactions.',
		};
		return descriptions[mode];
	}

	async process_content(
		url: string | string[],
		extract_depth: 'basic' | 'advanced' = 'basic',
	): Promise<ProcessingResult> {
		const { urls, validated_depth } = this.validate_input(
			url,
			extract_depth,
		);

		const request_fn = async () => {
			switch (this.mode) {
				case 'scrape':
					return this.handle_scrape(urls, validated_depth);
				case 'crawl':
					return this.handle_crawl(urls, validated_depth);
				case 'map':
					return this.handle_map(urls, validated_depth);
				case 'extract':
					return this.handle_extract(urls, validated_depth);
				case 'actions':
					return this.handle_actions(urls, validated_depth);
				default:
					throw new ProviderError(
						ErrorType.INVALID_INPUT,
						`Unknown Firecrawl mode: ${this.mode}`,
						this.name,
					);
			}
		};

		return this.execute_with_retry(request_fn);
	}

	private async handle_scrape(
		urls: string[],
		extract_depth: 'basic' | 'advanced',
	): Promise<ProcessingResult> {
		const results = await Promise.all(
			urls.map(async (single_url) => {
				const response =
					await this.http_client.post<FirecrawlScrapeResponse>(
						this.config.base_url,
						{
							url: single_url,
							formats: ['markdown'],
							onlyMainContent: true,
							waitFor: extract_depth === 'advanced' ? 5000 : 2000,
						},
						this.name,
					);

				if (!response.data.success || !response.data.data) {
					throw new ProviderError(
						ErrorType.API_ERROR,
						response.data.error || 'Failed to scrape URL',
						this.name,
					);
				}

				const data = response.data.data;
				return {
					url: single_url,
					content: data.markdown || '',
					title: data.metadata?.title,
					metadata: {
						title: data.metadata?.title,
						description: data.metadata?.description,
						language: data.metadata?.language,
						status_code: data.metadata?.statusCode,
						...data.metadata,
					},
				};
			}),
		);

		const aggregated = this.aggregate_content(results);
		const metadata = this.calculate_metadata(urls, extract_depth, {
			total_word_count: aggregated.total_word_count,
		});

		return {
			content: aggregated.combined_content,
			metadata,
			raw_contents: aggregated.raw_contents,
			source_provider: this.name,
		};
	}

	private async handle_crawl(
		urls: string[],
		extract_depth: 'basic' | 'advanced',
	): Promise<ProcessingResult> {
		const crawl_url = urls[0]; // Crawl only works with single URL

		// Start the crawl
		const crawl_response =
			await this.http_client.post<FirecrawlAsyncResponse>(
				this.config.base_url,
				{
					url: crawl_url,
					scrapeOptions: {
						formats: ['markdown'],
						onlyMainContent: true,
					},
					maxDepth: extract_depth === 'advanced' ? 3 : 1,
					limit: extract_depth === 'advanced' ? 50 : 20,
				},
				this.name,
			);

		if (!crawl_response.data.success || !crawl_response.data.id) {
			throw new ProviderError(
				ErrorType.API_ERROR,
				crawl_response.data.error || 'Failed to start crawl',
				this.name,
			);
		}

		// Poll for completion using the abstract provider's polling method
		const results = await this.poll_for_completion(
			async () => {
				const status_response =
					await this.http_client.get<FirecrawlStatusResponse>(
						`${this.config.base_url}/${crawl_response.data.id}`,
						this.name,
					);

				if (!status_response.data.success) {
					return {
						completed: false,
						error:
							status_response.data.error ||
							'Failed to check job status',
					};
				}

				if (status_response.data.status === 'failed') {
					return {
						completed: false,
						error: status_response.data.error || 'Job failed',
					};
				}

				if (
					status_response.data.status === 'completed' &&
					status_response.data.data
				) {
					const crawl_results = status_response.data.data.map(
						(item) => ({
							url: item.url,
							content: item.markdown || '',
							title: item.metadata?.title,
							metadata: {
								...item.metadata,
								error: item.error,
							},
						}),
					);

					return {
						completed: true,
						data: crawl_results,
					};
				}

				return { completed: false };
			},
			30, // max attempts
			2000, // poll interval
		);

		const aggregated = this.aggregate_content(results);
		const metadata = this.calculate_metadata(urls, extract_depth, {
			total_word_count: aggregated.total_word_count,
			pages_crawled: results.length,
		});

		return {
			content: aggregated.combined_content,
			metadata,
			raw_contents: aggregated.raw_contents,
			source_provider: this.name,
		};
	}

	private async handle_map(
		urls: string[],
		extract_depth: 'basic' | 'advanced',
	): Promise<ProcessingResult> {
		const results = await Promise.all(
			urls.map(async (single_url) => {
				const response =
					await this.http_client.post<FirecrawlMapResponse>(
						this.config.base_url,
						{
							url: single_url,
							limit: extract_depth === 'advanced' ? 100 : 50,
							includeSubdomains: extract_depth === 'advanced',
						},
						this.name,
					);

				if (!response.data.success) {
					throw new ProviderError(
						ErrorType.API_ERROR,
						response.data.error || 'Failed to map URL',
						this.name,
					);
				}

				const links = response.data.links || [];
				const content =
					links.length > 0
						? `Found ${links.length} links:\n${links.join('\n')}`
						: 'No links found';

				return {
					url: single_url,
					content,
					title: `URL Map for ${single_url}`,
					metadata: {
						links_count: links.length,
						links: links,
					},
				};
			}),
		);

		const aggregated = this.aggregate_content(results);
		const metadata = this.calculate_metadata(urls, extract_depth, {
			total_word_count: aggregated.total_word_count,
			total_links_found: results.reduce(
				(sum, r) => sum + (r.metadata.links_count || 0),
				0,
			),
		});

		return {
			content: aggregated.combined_content,
			metadata,
			raw_contents: aggregated.raw_contents,
			source_provider: this.name,
		};
	}

	private async handle_extract(
		urls: string[],
		extract_depth: 'basic' | 'advanced',
	): Promise<ProcessingResult> {
		const results = await Promise.all(
			urls.map(async (single_url) => {
				const response =
					await this.http_client.post<FirecrawlScrapeResponse>(
						this.config.base_url,
						{
							url: single_url,
							formats: ['markdown'],
							onlyMainContent: true,
							waitFor: extract_depth === 'advanced' ? 5000 : 2000,
							actions:
								extract_depth === 'advanced'
									? [
											{ type: 'wait', milliseconds: 3000 },
											{ type: 'screenshot' },
									  ]
									: undefined,
							extract: {
								schema: {
									type: 'object',
									properties: {
										title: { type: 'string' },
										content: { type: 'string' },
										author: { type: 'string' },
										date: { type: 'string' },
										tags: {
											type: 'array',
											items: { type: 'string' },
										},
									},
								},
							},
						},
						this.name,
					);

				if (!response.data.success || !response.data.data) {
					throw new ProviderError(
						ErrorType.API_ERROR,
						response.data.error || 'Failed to extract from URL',
						this.name,
					);
				}

				const data = response.data.data;
				const extracted_data = data.llm_extraction || {};
				const content =
					typeof extracted_data === 'object'
						? JSON.stringify(extracted_data, null, 2)
						: data.markdown || '';

				return {
					url: single_url,
					content,
					title: data.metadata?.title,
					metadata: {
						...data.metadata,
						extracted_data,
					},
				};
			}),
		);

		const aggregated = this.aggregate_content(results);
		const metadata = this.calculate_metadata(urls, extract_depth, {
			total_word_count: aggregated.total_word_count,
		});

		return {
			content: aggregated.combined_content,
			metadata,
			raw_contents: aggregated.raw_contents,
			source_provider: this.name,
		};
	}

	private async handle_actions(
		urls: string[],
		extract_depth: 'basic' | 'advanced',
	): Promise<ProcessingResult> {
		const results = await Promise.all(
			urls.map(async (single_url) => {
				const actions =
					extract_depth === 'advanced'
						? [
								{ type: 'wait', milliseconds: 3000 },
								{
									type: 'click',
									selector: 'button, [role="button"]',
								},
								{ type: 'wait', milliseconds: 2000 },
								{ type: 'screenshot' },
						  ]
						: [
								{ type: 'wait', milliseconds: 2000 },
								{ type: 'screenshot' },
						  ];

				const response =
					await this.http_client.post<FirecrawlScrapeResponse>(
						this.config.base_url,
						{
							url: single_url,
							formats: ['markdown'],
							onlyMainContent: true,
							actions,
							waitFor: extract_depth === 'advanced' ? 8000 : 4000,
						},
						this.name,
					);

				if (!response.data.success || !response.data.data) {
					throw new ProviderError(
						ErrorType.API_ERROR,
						response.data.error || 'Failed to execute actions on URL',
						this.name,
					);
				}

				const data = response.data.data;
				return {
					url: single_url,
					content: data.markdown || '',
					title: data.metadata?.title,
					metadata: {
						...data.metadata,
						actions_executed: actions.length,
						screenshot_url: data.screenshot,
					},
				};
			}),
		);

		const aggregated = this.aggregate_content(results);
		const metadata = this.calculate_metadata(urls, extract_depth, {
			total_word_count: aggregated.total_word_count,
		});

		return {
			content: aggregated.combined_content,
			metadata,
			raw_contents: aggregated.raw_contents,
			source_provider: this.name,
		};
	}
}

// Export factory functions for each mode
export const createFirecrawlScrapeProvider = () =>
	new FirecrawlProvider('scrape');
export const createFirecrawlCrawlProvider = () =>
	new FirecrawlProvider('crawl');
export const createFirecrawlMapProvider = () =>
	new FirecrawlProvider('map');
export const createFirecrawlExtractProvider = () =>
	new FirecrawlProvider('extract');
export const createFirecrawlActionsProvider = () =>
	new FirecrawlProvider('actions');

// Export individual providers for backward compatibility
export class FirecrawlScrapeProvider extends FirecrawlProvider {
	constructor() {
		super('scrape');
	}
}

export class FirecrawlCrawlProvider extends FirecrawlProvider {
	constructor() {
		super('crawl');
	}
}

export class FirecrawlMapProvider extends FirecrawlProvider {
	constructor() {
		super('map');
	}
}

export class FirecrawlExtractProvider extends FirecrawlProvider {
	constructor() {
		super('extract');
	}
}

export class FirecrawlActionsProvider extends FirecrawlProvider {
	constructor() {
		super('actions');
	}
}
