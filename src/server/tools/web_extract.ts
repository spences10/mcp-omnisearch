import { McpServer } from 'tmcp';
import type { GenericSchema } from 'valibot';
import * as v from 'valibot';
import { create_error_response } from '../../common/errors.js';
import { handle_large_result } from '../../common/results.js';
import {
	ErrorType,
	ProcessingProvider,
	ProviderError,
} from '../../common/types.js';
import { is_api_key_valid } from '../../common/validation.js';
import { config } from '../../config/env.js';

// Concrete provider imports
import { ExaContentsProvider } from '../../providers/processing/exa_contents/index.js';
import { ExaSimilarProvider } from '../../providers/processing/exa_similar/index.js';
import { FirecrawlActionsProvider } from '../../providers/processing/firecrawl_actions/index.js';
import { FirecrawlCrawlProvider } from '../../providers/processing/firecrawl_crawl/index.js';
import { FirecrawlExtractProvider } from '../../providers/processing/firecrawl_extract/index.js';
import { FirecrawlMapProvider } from '../../providers/processing/firecrawl_map/index.js';
import { FirecrawlScrapeProvider } from '../../providers/processing/firecrawl_scrape/index.js';
import { KagiSummarizerProvider } from '../../providers/processing/kagi_summarizer/index.js';
import { TavilyExtractProvider } from '../../providers/processing/tavily_extract/index.js';

export type WebExtractProvider =
	| 'tavily'
	| 'kagi'
	| 'firecrawl'
	| 'exa';

export type WebExtractMode =
	| 'extract'
	| 'summarize'
	| 'scrape'
	| 'crawl'
	| 'map'
	| 'actions'
	| 'contents'
	| 'similar';

// Provider key combines provider + mode
type ProviderKey = string;

const providers = new Map<ProviderKey, ProcessingProvider>();

const make_key = (provider: string, mode: string): ProviderKey =>
	`${provider}:${mode}`;

export const initialize_web_extract = (): boolean => {
	// Tavily
	if (
		is_api_key_valid(
			config.processing.tavily_extract.api_key,
			'tavily_extract',
		)
	)
		providers.set(
			make_key('tavily', 'extract'),
			new TavilyExtractProvider(),
		);

	// Kagi
	if (
		is_api_key_valid(
			config.processing.kagi_summarizer.api_key,
			'kagi_summarizer',
		)
	)
		providers.set(
			make_key('kagi', 'summarize'),
			new KagiSummarizerProvider(),
		);

	// Firecrawl
	if (
		is_api_key_valid(
			config.processing.firecrawl_scrape.api_key,
			'firecrawl',
		)
	) {
		providers.set(
			make_key('firecrawl', 'scrape'),
			new FirecrawlScrapeProvider(),
		);
		providers.set(
			make_key('firecrawl', 'crawl'),
			new FirecrawlCrawlProvider(),
		);
		providers.set(
			make_key('firecrawl', 'map'),
			new FirecrawlMapProvider(),
		);
		providers.set(
			make_key('firecrawl', 'extract'),
			new FirecrawlExtractProvider(),
		);
		providers.set(
			make_key('firecrawl', 'actions'),
			new FirecrawlActionsProvider(),
		);
	}

	// Exa
	if (
		is_api_key_valid(config.processing.exa_contents.api_key, 'exa')
	) {
		providers.set(
			make_key('exa', 'contents'),
			new ExaContentsProvider(),
		);
		providers.set(
			make_key('exa', 'similar'),
			new ExaSimilarProvider(),
		);
	}

	return providers.size > 0;
};

export const get_available_providers = () => {
	const available = new Set<string>();
	for (const key of providers.keys()) {
		available.add(key.split(':')[0]);
	}
	return Array.from(available);
};

// Default modes per provider
const default_modes: Record<WebExtractProvider, WebExtractMode> = {
	tavily: 'extract',
	kagi: 'summarize',
	firecrawl: 'scrape',
	exa: 'contents',
};

// Valid modes per provider
const valid_modes: Record<WebExtractProvider, WebExtractMode[]> = {
	tavily: ['extract'],
	kagi: ['summarize'],
	firecrawl: ['scrape', 'crawl', 'map', 'extract', 'actions'],
	exa: ['contents', 'similar'],
};

export const register_web_extract = (
	server: McpServer<GenericSchema>,
) => {
	if (providers.size === 0) return;

	const available = get_available_providers() as WebExtractProvider[];

	server.tool(
		{
			name: 'web_extract',
			description:
				'Extract, process, or summarize web content from URLs. Use when you need to read page content, summarize articles, crawl sites, or extract structured data. Providers: tavily (content extraction), kagi (summarization of pages/videos/podcasts), firecrawl (scraping/crawling/mapping/structured extraction/interactive), exa (content retrieval/similar pages).',
			annotations: {
				readOnlyHint: true,
				destructiveHint: false,
				idempotentHint: true,
				openWorldHint: true,
			},
			schema: v.object({
				url: v.pipe(
					v.union([v.string(), v.array(v.string())]),
					v.description('URL or array of URLs to process'),
				),
				provider: v.pipe(
					v.picklist(available),
					v.description('Processing provider to use'),
				),
				mode: v.optional(
					v.pipe(
						v.picklist([
							'extract',
							'summarize',
							'scrape',
							'crawl',
							'map',
							'actions',
							'contents',
							'similar',
						]),
						v.description(
							'Processing mode. Firecrawl: scrape/crawl/map/extract/actions. Exa: contents/similar. Tavily: extract. Kagi: summarize. Defaults to provider default.',
						),
					),
				),
				extract_depth: v.optional(
					v.pipe(
						v.picklist(['basic', 'advanced']),
						v.description('Extraction depth (default: basic)'),
					),
				),
			}),
		},
		async ({ url, provider, mode, extract_depth }) => {
			try {
				const resolved_mode =
					mode || default_modes[provider as WebExtractProvider];

				// Validate mode for provider
				const allowed = valid_modes[provider as WebExtractProvider];
				if (allowed && !allowed.includes(resolved_mode)) {
					throw new ProviderError(
						ErrorType.INVALID_INPUT,
						`Mode "${resolved_mode}" is not valid for provider "${provider}". Valid modes: ${allowed.join(', ')}`,
						'web_extract',
					);
				}

				const key = make_key(provider, resolved_mode);
				const selected = providers.get(key);

				if (!selected) {
					throw new ProviderError(
						ErrorType.INVALID_INPUT,
						`Provider "${provider}" with mode "${resolved_mode}" is not available. Check your API keys.`,
						'web_extract',
					);
				}

				const result = await selected.process_content(
					url,
					extract_depth,
				);
				const safe_result = handle_large_result(
					result,
					'web_extract',
				);
				return {
					content: [
						{
							type: 'text' as const,
							text: JSON.stringify(safe_result, null, 2),
						},
					],
				};
			} catch (error) {
				const error_response = create_error_response(error as Error);
				return {
					content: [
						{
							type: 'text' as const,
							text: error_response.error,
						},
					],
					isError: true,
				};
			}
		},
	);
};
