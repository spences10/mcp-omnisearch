import type {
	ProcessingProvider,
	SearchProvider,
} from '../common/types.js';
import { config } from '../config/env.js';
import { ExaAnswerProvider } from '../providers/ai-response/exa-answer/index.js';
import { KagiFastGPTProvider } from '../providers/ai-response/kagi-fastgpt/index.js';
import { LinkupProvider } from '../providers/ai-response/linkup/index.js';
import { KagiEnrichmentSearchProvider } from '../providers/enhancement/kagi-enrichment/index.js';
import { ExaContentsProvider } from '../providers/processing/exa-contents/index.js';
import { ExaSimilarProvider } from '../providers/processing/exa-similar/index.js';
import { FirecrawlActionsProvider } from '../providers/processing/firecrawl-actions/index.js';
import { FirecrawlCrawlProvider } from '../providers/processing/firecrawl-crawl/index.js';
import { FirecrawlExtractProvider } from '../providers/processing/firecrawl-extract/index.js';
import { FirecrawlMapProvider } from '../providers/processing/firecrawl-map/index.js';
import { FirecrawlScrapeProvider } from '../providers/processing/firecrawl-scrape/index.js';
import { KagiSummarizerProvider } from '../providers/processing/kagi-summarizer/index.js';
import { TavilyExtractProvider } from '../providers/processing/tavily-extract/index.js';
import { BraveSearchProvider } from '../providers/search/brave/index.js';
import { ExaSearchProvider } from '../providers/search/exa/index.js';
import { GitHubSearchProvider } from '../providers/search/github/index.js';
import { KagiSearchProvider } from '../providers/search/kagi/index.js';
import { YouComSearchProvider } from '../providers/search/youcom/index.js';
import { TavilySearchProvider } from '../providers/search/tavily/index.js';
import type { ProviderDefinition } from './provider-registry.js';

export type WebSearchProviderName =
	| 'tavily'
	| 'brave'
	| 'kagi'
	| 'exa'
	| 'youcom'
	| 'kagi_enrichment';

export type AISearchProviderName =
	| 'kagi_fastgpt'
	| 'exa_answer'
	| 'linkup';

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

export const make_processing_provider_key = (
	provider: string,
	mode: string,
) => `${provider}:${mode}`;

export interface ProcessingProviderDefinition extends ProviderDefinition<ProcessingProvider> {
	name: WebExtractProvider;
	modes: readonly [WebExtractMode];
	default_mode?: boolean;
}

export const web_search_provider_definitions = [
	{
		id: 'tavily',
		name: 'tavily',
		category: 'search',
		api_key_name: 'TAVILY_API_KEY',
		tools: ['web_search'],
		capabilities: [
			'web_search',
			'domain_filters',
			'operator_translation',
		],
		api_key: config.search.tavily.api_key,
		create: () => new TavilySearchProvider(),
	},
	{
		id: 'brave',
		name: 'brave',
		category: 'search',
		api_key_name: 'BRAVE_API_KEY',
		tools: ['web_search'],
		capabilities: [
			'web_search',
			'domain_filters',
			'operator_passthrough',
		],
		api_key: config.search.brave.api_key,
		create: () => new BraveSearchProvider(),
	},
	{
		id: 'kagi',
		name: 'kagi',
		category: 'search',
		api_key_name: 'KAGI_API_KEY',
		tools: ['web_search'],
		capabilities: [
			'web_search',
			'domain_filters',
			'operator_passthrough',
		],
		api_key: config.search.kagi.api_key,
		create: () => new KagiSearchProvider(),
	},
	{
		id: 'exa',
		name: 'exa',
		category: 'search',
		api_key_name: 'EXA_API_KEY',
		tools: ['web_search'],
		capabilities: ['web_search', 'domain_filters', 'semantic_search'],
		api_key: config.search.exa.api_key,
		create: () => new ExaSearchProvider(),
	},
	{
		id: 'youcom',
		name: 'youcom',
		category: 'search',
		api_key_name: 'YDC_API_KEY',
		tools: ['web_search'],
		capabilities: ['web_search', 'news_search', 'operator_passthrough'],
		api_key: config.search.youcom.api_key,
		create: () => new YouComSearchProvider(),
	},
	{
		id: 'kagi_enrichment',
		name: 'kagi_enrichment',
		category: 'search',
		api_key_name: 'KAGI_API_KEY',
		tools: ['web_search'],
		capabilities: ['specialized_indexes', 'web_enrichment'],
		api_key: config.enhancement.kagi_enrichment.api_key,
		create: () => new KagiEnrichmentSearchProvider(),
	},
] satisfies readonly ProviderDefinition<SearchProvider>[];

export const ai_search_provider_definitions = [
	{
		id: 'kagi_fastgpt',
		name: 'kagi_fastgpt',
		category: 'ai_response',
		api_key_name: 'KAGI_API_KEY',
		tools: ['ai_search'],
		capabilities: ['answer_generation', 'citations'],
		api_key: config.ai_response.kagi_fastgpt.api_key,
		create: () => new KagiFastGPTProvider(),
	},
	{
		id: 'exa_answer',
		name: 'exa_answer',
		category: 'ai_response',
		api_key_name: 'EXA_API_KEY',
		tools: ['ai_search'],
		capabilities: ['answer_generation', 'semantic_search'],
		api_key: config.ai_response.exa_answer.api_key,
		create: () => new ExaAnswerProvider(),
	},
	{
		id: 'linkup',
		name: 'linkup',
		category: 'ai_response',
		api_key_name: 'LINKUP_API_KEY',
		tools: ['ai_search'],
		capabilities: ['answer_generation', 'citations'],
		api_key: config.ai_response.linkup.api_key,
		create: () => new LinkupProvider(),
	},
] satisfies readonly ProviderDefinition<SearchProvider>[];

export const github_provider_definitions = [
	{
		id: 'github',
		name: 'github',
		category: 'search',
		api_key_name: 'GITHUB_API_KEY',
		tools: ['github_search'],
		modes: ['code', 'repositories', 'users'],
		capabilities: ['code_search', 'repository_search', 'user_search'],
		api_key: config.search.github.api_key,
		create: () => new GitHubSearchProvider(),
	},
] satisfies readonly ProviderDefinition<GitHubSearchProvider>[];

export const web_extract_provider_definitions = [
	{
		id: make_processing_provider_key('tavily', 'extract'),
		name: 'tavily',
		category: 'processing',
		api_key: config.processing.tavily_extract.api_key,
		api_key_name: 'TAVILY_API_KEY',
		tools: ['web_extract'],
		modes: ['extract'],
		capabilities: ['content_extraction', 'raw_contents'],
		default_mode: true,
		create: () => new TavilyExtractProvider(),
	},
	{
		id: make_processing_provider_key('kagi', 'summarize'),
		name: 'kagi',
		category: 'processing',
		api_key: config.processing.kagi_summarizer.api_key,
		api_key_name: 'KAGI_API_KEY',
		tools: ['web_extract'],
		modes: ['summarize'],
		capabilities: ['summarization'],
		default_mode: true,
		create: () => new KagiSummarizerProvider(),
	},
	{
		id: make_processing_provider_key('firecrawl', 'scrape'),
		name: 'firecrawl',
		category: 'processing',
		api_key: config.processing.firecrawl_scrape.api_key,
		api_key_name: 'FIRECRAWL_API_KEY',
		tools: ['web_extract'],
		modes: ['scrape'],
		capabilities: ['scraping'],
		default_mode: true,
		create: () => new FirecrawlScrapeProvider(),
	},
	{
		id: make_processing_provider_key('firecrawl', 'crawl'),
		name: 'firecrawl',
		category: 'processing',
		api_key: config.processing.firecrawl_crawl.api_key,
		api_key_name: 'FIRECRAWL_API_KEY',
		tools: ['web_extract'],
		modes: ['crawl'],
		capabilities: ['crawling'],
		create: () => new FirecrawlCrawlProvider(),
	},
	{
		id: make_processing_provider_key('firecrawl', 'map'),
		name: 'firecrawl',
		category: 'processing',
		api_key: config.processing.firecrawl_map.api_key,
		api_key_name: 'FIRECRAWL_API_KEY',
		tools: ['web_extract'],
		modes: ['map'],
		capabilities: ['site_mapping'],
		create: () => new FirecrawlMapProvider(),
	},
	{
		id: make_processing_provider_key('firecrawl', 'extract'),
		name: 'firecrawl',
		category: 'processing',
		api_key: config.processing.firecrawl_extract.api_key,
		api_key_name: 'FIRECRAWL_API_KEY',
		tools: ['web_extract'],
		modes: ['extract'],
		capabilities: ['structured_extraction'],
		create: () => new FirecrawlExtractProvider(),
	},
	{
		id: make_processing_provider_key('firecrawl', 'actions'),
		name: 'firecrawl',
		category: 'processing',
		api_key: config.processing.firecrawl_actions.api_key,
		api_key_name: 'FIRECRAWL_API_KEY',
		tools: ['web_extract'],
		modes: ['actions'],
		capabilities: ['browser_actions'],
		create: () => new FirecrawlActionsProvider(),
	},
	{
		id: make_processing_provider_key('exa', 'contents'),
		name: 'exa',
		category: 'processing',
		api_key: config.processing.exa_contents.api_key,
		api_key_name: 'EXA_API_KEY',
		tools: ['web_extract'],
		modes: ['contents'],
		capabilities: ['content_retrieval'],
		default_mode: true,
		create: () => new ExaContentsProvider(),
	},
	{
		id: make_processing_provider_key('exa', 'similar'),
		name: 'exa',
		category: 'processing',
		api_key: config.processing.exa_similar.api_key,
		api_key_name: 'EXA_API_KEY',
		tools: ['web_extract'],
		modes: ['similar'],
		capabilities: ['similar_pages'],
		create: () => new ExaSimilarProvider(),
	},
] satisfies readonly ProcessingProviderDefinition[];

export const get_default_web_extract_mode = (
	provider: WebExtractProvider,
): WebExtractMode | undefined =>
	web_extract_provider_definitions.find(
		(definition) =>
			definition.name === provider && definition.default_mode,
	)?.modes[0];

export const get_valid_web_extract_modes = (
	provider: WebExtractProvider,
): WebExtractMode[] =>
	web_extract_provider_definitions
		.filter((definition) => definition.name === provider)
		.map((definition) => definition.modes[0]);
