import { KagiFastGPTProvider } from './ai_response/kagi_fastgpt/index.js';
import { PerplexityProvider } from './ai_response/perplexity/index.js';
import { JinaGroundingProvider } from './enhancement/jina_grounding/index.js';
import { KagiEnrichmentProvider } from './enhancement/kagi_enrichment/index.js';
import { FirecrawlActionsProvider } from './processing/firecrawl_actions/index.js';
import { FirecrawlCrawlProvider } from './processing/firecrawl_crawl/index.js';
import { FirecrawlExtractProvider } from './processing/firecrawl_extract/index.js';
import { FirecrawlMapProvider } from './processing/firecrawl_map/index.js';
import { FirecrawlScrapeProvider } from './processing/firecrawl_scrape/index.js';
import { JinaReaderProvider } from './processing/jina_reader/index.js';
import { KagiSummarizerProvider } from './processing/kagi_summarizer/index.js';
import { TavilyExtractProvider } from './processing/tavily_extract/index.js';
import { BraveSearchProvider } from './search/brave/index.js';
import { BrightDataSearchProvider } from './search/brightdata/index.js';
import { ExaSearchProvider } from './search/exa/index.js';
import { KagiSearchProvider } from './search/kagi/index.js';
import { TavilySearchProvider } from './search/tavily/index.js';

import { is_api_key_valid } from '../common/utils.js';
import { config } from '../config/env.js';
import {
	available_providers,
	register_enhancement_provider,
	register_processing_provider,
	register_search_provider,
} from '../server/tools.js';

export const initialize_providers = () => {
	// Initialize search providers
	if (is_api_key_valid(config.search.tavily.api_key, 'tavily')) {
		register_search_provider(new TavilySearchProvider());
	}

	if (is_api_key_valid(config.search.brave.api_key, 'brave')) {
		register_search_provider(new BraveSearchProvider());
	}

	if (is_api_key_valid(config.search.kagi.api_key, 'kagi')) {
		register_search_provider(new KagiSearchProvider());
	}

	if (is_api_key_valid(config.search.exa.api_key, 'exa')) {
		register_search_provider(new ExaSearchProvider());
	}

	if (is_api_key_valid(config.search.brightdata.api_key, 'brightdata')) {
		register_search_provider(new BrightDataSearchProvider());
	}

	// Initialize AI response providers (using SearchProvider interface for result compatibility)
	if (
		is_api_key_valid(
			config.ai_response.perplexity.api_key,
			'perplexity',
		)
	) {
		register_search_provider(new PerplexityProvider(), true); // AI response provider
	}

	if (
		is_api_key_valid(
			config.ai_response.kagi_fastgpt.api_key,
			'kagi_fastgpt',
		)
	) {
		register_search_provider(new KagiFastGPTProvider(), true); // AI response provider
	}

	// Initialize processing providers
	if (
		is_api_key_valid(
			config.processing.jina_reader.api_key,
			'jina_reader',
		)
	) {
		register_processing_provider(new JinaReaderProvider());
	}

	if (
		is_api_key_valid(
			config.processing.kagi_summarizer.api_key,
			'kagi_summarizer',
		)
	) {
		register_processing_provider(new KagiSummarizerProvider());
	}

	if (
		is_api_key_valid(
			config.processing.tavily_extract.api_key,
			'tavily_extract',
		)
	) {
		register_processing_provider(new TavilyExtractProvider());
	}

	if (
		is_api_key_valid(
			config.processing.firecrawl_scrape.api_key,
			'firecrawl_scrape',
		)
	) {
		register_processing_provider(new FirecrawlScrapeProvider());
	}

	if (
		is_api_key_valid(
			config.processing.firecrawl_crawl.api_key,
			'firecrawl_crawl',
		)
	) {
		register_processing_provider(new FirecrawlCrawlProvider());
	}

	if (
		is_api_key_valid(
			config.processing.firecrawl_map.api_key,
			'firecrawl_map',
		)
	) {
		register_processing_provider(new FirecrawlMapProvider());
	}

	if (
		is_api_key_valid(
			config.processing.firecrawl_extract.api_key,
			'firecrawl_extract',
		)
	) {
		register_processing_provider(new FirecrawlExtractProvider());
	}

	if (
		is_api_key_valid(
			config.processing.firecrawl_actions.api_key,
			'firecrawl_actions',
		)
	) {
		register_processing_provider(new FirecrawlActionsProvider());
	}

	// Initialize enhancement providers
	if (
		is_api_key_valid(
			config.enhancement.jina_grounding.api_key,
			'jina_grounding',
		)
	) {
		register_enhancement_provider(new JinaGroundingProvider());
	}

	if (
		is_api_key_valid(
			config.enhancement.kagi_enrichment.api_key,
			'kagi_enrichment',
		)
	) {
		register_enhancement_provider(new KagiEnrichmentProvider());
	}

	// Log available providers
	console.error('Available providers:');
	if (available_providers.search.size > 0) {
		console.error(
			`- Search: ${Array.from(available_providers.search).join(
				', ',
			)}`,
		);
	} else {
		console.error('- Search: None available (missing API keys)');
	}

	if (available_providers.ai_response.size > 0) {
		console.error(
			`- AI Response: ${Array.from(
				available_providers.ai_response,
			).join(', ')}`,
		);
	} else {
		console.error('- AI Response: None available (missing API keys)');
	}

	if (available_providers.processing.size > 0) {
		console.error(
			`- Processing: ${Array.from(
				available_providers.processing,
			).join(', ')}`,
		);
	} else {
		console.error('- Processing: None available (missing API keys)');
	}

	if (available_providers.enhancement.size > 0) {
		console.error(
			`- Enhancement: ${Array.from(
				available_providers.enhancement,
			).join(', ')}`,
		);
	} else {
		console.error('- Enhancement: None available (missing API keys)');
	}
};
