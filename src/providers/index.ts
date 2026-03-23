import { JinaGroundingProvider } from './enhancement/jina_grounding/index.js';
import { KagiEnrichmentProvider } from './enhancement/kagi_enrichment/index.js';
import { KagiSummarizerProvider } from './processing/kagi_summarizer/index.js';
import { LinkupFetchProvider } from './processing/linkup_fetch/index.js';
import { TavilyExtractProvider } from './processing/tavily_extract/index.js';
import { UnifiedAISearchProvider } from './unified/ai_search.js';
import { UnifiedExaProcessProvider } from './unified/exa_process.js';
import { UnifiedFirecrawlProvider } from './unified/firecrawl_process.js';
import { UnifiedGitHubSearchProvider } from './unified/github_search.js';
import { UnifiedWebSearchProvider } from './unified/web_search.js';

import { is_api_key_valid } from '../common/utils.js';
import { config } from '../config/env.js';
import {
	available_providers,
	register_ai_search_provider,
	register_enhancement_provider,
	register_exa_process_provider,
	register_firecrawl_process_provider,
	register_github_search_provider,
	register_processing_provider,
	register_web_search_provider,
} from '../server/tools.js';

export const initialize_providers = () => {
	// Check if we have at least one web search provider API key
	const has_web_search =
		is_api_key_valid(config.search.tavily.api_key, 'tavily') ||
		is_api_key_valid(config.search.brave.api_key, 'brave') ||
		is_api_key_valid(config.search.kagi.api_key, 'kagi') ||
		is_api_key_valid(config.search.exa.api_key, 'exa') ||
		is_api_key_valid(config.search.linkup.api_key, 'linkup');

	if (has_web_search) {
		register_web_search_provider(new UnifiedWebSearchProvider());
	}

	// Check if we have GitHub API key
	if (is_api_key_valid(config.search.github.api_key, 'github')) {
		register_github_search_provider(
			new UnifiedGitHubSearchProvider(),
		);
	}

	// Check if we have at least one AI search provider API key
	const has_ai_search =
		is_api_key_valid(
			config.ai_response.perplexity.api_key,
			'perplexity',
		) ||
		is_api_key_valid(
			config.ai_response.kagi_fastgpt.api_key,
			'kagi_fastgpt',
		) ||
		is_api_key_valid(
			config.ai_response.exa_answer.api_key,
			'exa_answer',
		) ||
		is_api_key_valid(
			config.ai_response.linkup_answer.api_key,
			'linkup_answer',
		);

	if (has_ai_search) {
		register_ai_search_provider(new UnifiedAISearchProvider());
	}

	// Check if we have at least one Firecrawl API key
	const has_firecrawl =
		is_api_key_valid(
			config.processing.firecrawl_scrape.api_key,
			'firecrawl_scrape',
		) ||
		is_api_key_valid(
			config.processing.firecrawl_crawl.api_key,
			'firecrawl_crawl',
		) ||
		is_api_key_valid(
			config.processing.firecrawl_map.api_key,
			'firecrawl_map',
		) ||
		is_api_key_valid(
			config.processing.firecrawl_extract.api_key,
			'firecrawl_extract',
		) ||
		is_api_key_valid(
			config.processing.firecrawl_actions.api_key,
			'firecrawl_actions',
		);

	if (has_firecrawl) {
		register_firecrawl_process_provider(
			new UnifiedFirecrawlProvider(),
		);
	}

	// Check if we have at least one Exa processing API key
	const has_exa_process =
		is_api_key_valid(
			config.processing.exa_contents.api_key,
			'exa_contents',
		) ||
		is_api_key_valid(
			config.processing.exa_similar.api_key,
			'exa_similar',
		);

	if (has_exa_process) {
		register_exa_process_provider(new UnifiedExaProcessProvider());
	}

	// Initialize remaining processing providers
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
			config.processing.linkup_fetch.api_key,
			'linkup_fetch',
		)
	) {
		register_processing_provider(new LinkupFetchProvider());
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
			`- Search: ${Array.from(available_providers.search).join(', ')}`,
		);
	} else {
		console.error('- Search: None available (missing API keys)');
	}

	if (available_providers.ai_response.size > 0) {
		console.error(
			`- AI Response: ${Array.from(available_providers.ai_response).join(', ')}`,
		);
	} else {
		console.error('- AI Response: None available (missing API keys)');
	}

	if (available_providers.processing.size > 0) {
		console.error(
			`- Processing: ${Array.from(available_providers.processing).join(', ')}`,
		);
	} else {
		console.error('- Processing: None available (missing API keys)');
	}

	if (available_providers.enhancement.size > 0) {
		console.error(
			`- Enhancement: ${Array.from(available_providers.enhancement).join(', ')}`,
		);
	} else {
		console.error('- Enhancement: None available (missing API keys)');
	}
};
