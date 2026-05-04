import { McpServer } from 'tmcp';
import type { GenericSchema } from 'valibot';
import * as v from 'valibot';
import { omit_raw_contents } from '../../common/results.js';
import {
	ErrorType,
	ProcessingProvider,
	ProviderError,
} from '../../common/types.js';
import { config } from '../../config/env.js';
import { ProviderRegistry } from '../provider-registry.js';
import { handle_tool_result } from './responses.js';
import {
	include_raw_contents_schema,
	large_result_mode_schema,
	url_or_urls_schema,
} from './schemas.js';

// Concrete provider imports
import { ExaContentsProvider } from '../../providers/processing/exa-contents/index.js';
import { ExaSimilarProvider } from '../../providers/processing/exa-similar/index.js';
import { FirecrawlActionsProvider } from '../../providers/processing/firecrawl-actions/index.js';
import { FirecrawlCrawlProvider } from '../../providers/processing/firecrawl-crawl/index.js';
import { FirecrawlExtractProvider } from '../../providers/processing/firecrawl-extract/index.js';
import { FirecrawlMapProvider } from '../../providers/processing/firecrawl-map/index.js';
import { FirecrawlScrapeProvider } from '../../providers/processing/firecrawl-scrape/index.js';
import { KagiSummarizerProvider } from '../../providers/processing/kagi-summarizer/index.js';
import { TavilyExtractProvider } from '../../providers/processing/tavily-extract/index.js';

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

const providers = new ProviderRegistry<ProcessingProvider>();

const make_key = (provider: string, mode: string): ProviderKey =>
	`${provider}:${mode}`;

export const initialize_web_extract = (): boolean => {
	providers.clear();
	providers.register({
		id: make_key('tavily', 'extract'),
		name: 'tavily',
		category: 'processing',
		api_key: config.processing.tavily_extract.api_key,
		api_key_name: 'tavily_extract',
		modes: ['extract'],
		create: () => new TavilyExtractProvider(),
	});
	providers.register({
		id: make_key('kagi', 'summarize'),
		name: 'kagi',
		category: 'processing',
		api_key: config.processing.kagi_summarizer.api_key,
		api_key_name: 'kagi_summarizer',
		modes: ['summarize'],
		create: () => new KagiSummarizerProvider(),
	});

	const firecrawl_modes: Array<{
		mode: WebExtractMode;
		create: () => ProcessingProvider;
	}> = [
		{ mode: 'scrape', create: () => new FirecrawlScrapeProvider() },
		{ mode: 'crawl', create: () => new FirecrawlCrawlProvider() },
		{ mode: 'map', create: () => new FirecrawlMapProvider() },
		{ mode: 'extract', create: () => new FirecrawlExtractProvider() },
		{ mode: 'actions', create: () => new FirecrawlActionsProvider() },
	];
	for (const { mode, create } of firecrawl_modes) {
		providers.register({
			id: make_key('firecrawl', mode),
			name: 'firecrawl',
			category: 'processing',
			api_key: config.processing.firecrawl_scrape.api_key,
			api_key_name: 'firecrawl',
			modes: [mode],
			create,
		});
	}

	for (const mode of ['contents', 'similar'] as const) {
		providers.register({
			id: make_key('exa', mode),
			name: 'exa',
			category: 'processing',
			api_key: config.processing.exa_contents.api_key,
			api_key_name: 'exa',
			modes: [mode],
			create: () =>
				mode === 'contents'
					? new ExaContentsProvider()
					: new ExaSimilarProvider(),
		});
	}

	return providers.size > 0;
};

export const get_available_providers = () => providers.names();

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
				url: url_or_urls_schema,
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
				large_result_mode: large_result_mode_schema,
				include_raw_contents: include_raw_contents_schema,
			}),
		},
		async ({
			url,
			provider,
			mode,
			extract_depth,
			large_result_mode,
			include_raw_contents = true,
		}) =>
			handle_tool_result(
				'web_extract',
				async () => {
					const provider_name = provider as WebExtractProvider;
					const resolved_mode = mode || default_modes[provider_name];
					const allowed = valid_modes[provider_name];

					if (allowed && !allowed.includes(resolved_mode)) {
						throw new ProviderError(
							ErrorType.INVALID_INPUT,
							`Mode "${resolved_mode}" is not valid for provider "${provider}". Valid modes: ${allowed.join(', ')}`,
							'web_extract',
						);
					}

					const key = make_key(provider, resolved_mode);
					const selected = providers.require(
						key,
						'web_extract',
						`Provider "${provider}" with mode "${resolved_mode}" is not available. Check your API keys.`,
					);

					const result = await selected.process_content(
						url,
						extract_depth,
					);

					return include_raw_contents
						? result
						: omit_raw_contents(result);
				},
				{ large_result_mode },
			),
	);
};
