import { config } from '../config/env.js';
import type { ErrorType } from '../common/types.js';
import type { ProviderStatus } from './provider-registry.js';
import { get_provider_runtime } from './provider-runtime.js';

export interface ProviderInfo {
	id: string;
	tools: string[];
	timeout: number;
	enabled: boolean;
	cooldown: boolean;
	last_error_type: ErrorType | null;
}

export const provider_timeouts: Record<string, number> = {
	tavily: config.search.tavily.timeout,
	brave: config.search.brave.timeout,
	kagi: config.search.kagi.timeout,
	exa: config.search.exa.timeout,
	kagi_enrichment: config.enhancement.kagi_enrichment.timeout,
	github: config.search.github.timeout,
	kagi_fastgpt: config.ai_response.kagi_fastgpt.timeout,
	exa_answer: config.ai_response.exa_answer.timeout,
	linkup: config.ai_response.linkup.timeout,
	'tavily:extract': config.processing.tavily_extract.timeout,
	'kagi:summarize': config.processing.kagi_summarizer.timeout,
	'firecrawl:scrape': config.processing.firecrawl_scrape.timeout,
	'firecrawl:crawl': config.processing.firecrawl_crawl.timeout,
	'firecrawl:map': config.processing.firecrawl_map.timeout,
	'firecrawl:extract': config.processing.firecrawl_extract.timeout,
	'firecrawl:actions': config.processing.firecrawl_actions.timeout,
	'exa:contents': config.processing.exa_contents.timeout,
	'exa:similar': config.processing.exa_similar.timeout,
};

export const get_provider_timeout = (id: string): number => {
	const timeout = provider_timeouts[id];
	if (typeof timeout !== 'number') {
		throw new Error(`Missing timeout mapping for provider "${id}"`);
	}

	return timeout;
};

const runtime_for = (entry: ProviderStatus) => {
	const by_id = get_provider_runtime(entry.id);
	if (by_id.last_error_type !== null) return by_id;
	return get_provider_runtime(entry.name);
};

export const list_provider_info = (
	entries: readonly ProviderStatus[],
	filter?: string,
): ProviderInfo[] =>
	entries
		.filter(
			(entry) =>
				!filter || entry.id === filter || entry.name === filter,
		)
		.map((entry) => {
			const runtime = runtime_for(entry);
			return {
				id: entry.id,
				tools: [...entry.tools],
				timeout: get_provider_timeout(entry.id),
				enabled: entry.status === 'available',
				cooldown: runtime.cooldown,
				last_error_type: runtime.last_error_type,
			};
		});
