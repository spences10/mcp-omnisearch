import { McpServer } from 'tmcp';
import type { GenericSchema } from 'valibot';
import * as v from 'valibot';
import {
	EnhancementProvider,
	ProcessingProvider,
	SearchProvider,
} from '../common/types.js';
import {
	create_error_response,
	handle_large_result,
} from '../common/utils.js';
import type { UnifiedExaProcessingProvider } from '../providers/unified/exa_process.js';
import type { UnifiedFirecrawlProcessingProvider } from '../providers/unified/firecrawl_process.js';

// Track available providers by category
export const available_providers = {
	search: new Set<string>(),
	ai_response: new Set<string>(),
	processing: new Set<string>(),
	enhancement: new Set<string>(),
};

class ToolRegistry {
	private web_search_provider?: SearchProvider;
	private github_search_provider?: SearchProvider;
	private ai_search_provider?: SearchProvider;
	private firecrawl_process_provider?: UnifiedFirecrawlProcessingProvider;
	private exa_process_provider?: UnifiedExaProcessingProvider;
	private processing_providers: Map<string, ProcessingProvider> =
		new Map();
	private enhancement_providers: Map<string, EnhancementProvider> =
		new Map();

	register_web_search_provider(provider: SearchProvider) {
		this.web_search_provider = provider;
		available_providers.search.add(provider.name);
	}

	register_github_search_provider(provider: SearchProvider) {
		this.github_search_provider = provider;
		available_providers.search.add(provider.name);
	}

	register_ai_search_provider(provider: SearchProvider) {
		this.ai_search_provider = provider;
		available_providers.ai_response.add(provider.name);
	}

	register_firecrawl_process_provider(
		provider: UnifiedFirecrawlProcessingProvider,
	) {
		this.firecrawl_process_provider = provider;
		available_providers.processing.add(provider.name);
	}

	register_exa_process_provider(
		provider: UnifiedExaProcessingProvider,
	) {
		this.exa_process_provider = provider;
		available_providers.processing.add(provider.name);
	}

	register_processing_provider(provider: ProcessingProvider) {
		this.processing_providers.set(provider.name, provider);
		available_providers.processing.add(provider.name);
	}

	register_enhancement_provider(provider: EnhancementProvider) {
		this.enhancement_providers.set(provider.name, provider);
		available_providers.enhancement.add(provider.name);
	}

	setup_tool_handlers(server: McpServer<GenericSchema>) {
		// Register web search tool
		if (this.web_search_provider) {
			server.tool(
				{
					name: 'web_search',
					description: this.web_search_provider.description,
					schema: v.object({
						query: v.pipe(v.string(), v.description('Query')),
						provider: v.pipe(
							v.union([
								v.literal('tavily'),
								v.literal('brave'),
								v.literal('kagi'),
								v.literal('exa'),
							]),
							v.description('Search provider'),
						),
						limit: v.optional(
							v.pipe(v.number(), v.description('Result limit')),
						),
						include_domains: v.optional(
							v.pipe(
								v.array(v.string()),
								v.description('Domains to include'),
							),
						),
						exclude_domains: v.optional(
							v.pipe(
								v.array(v.string()),
								v.description('Domains to exclude'),
							),
						),
					}),
				},
				async ({
					query,
					provider,
					limit,
					include_domains,
					exclude_domains,
				}) => {
					try {
						const results = await this.web_search_provider!.search({
							query,
							provider,
							limit,
							include_domains,
							exclude_domains,
						} as any);
						const safe_results = handle_large_result(
							results,
							'web_search',
						);
						return {
							content: [
								{
									type: 'text' as const,
									text: JSON.stringify(safe_results, null, 2),
								},
							],
						};
					} catch (error) {
						const error_response = create_error_response(
							error as Error,
						);
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
		}

		// Register GitHub search tool
		if (this.github_search_provider) {
			server.tool(
				{
					name: 'github_search',
					description: this.github_search_provider.description,
					schema: v.object({
						query: v.pipe(v.string(), v.description('Query')),
						search_type: v.optional(
							v.pipe(
								v.union([
									v.literal('code'),
									v.literal('repositories'),
									v.literal('users'),
								]),
								v.description('Search type (default: code)'),
							),
						),
						limit: v.optional(
							v.pipe(v.number(), v.description('Result limit')),
						),
						sort: v.optional(
							v.pipe(
								v.union([
									v.literal('stars'),
									v.literal('forks'),
									v.literal('updated'),
								]),
								v.description('Sort order (repositories only)'),
							),
						),
					}),
				},
				async ({ query, search_type, limit, sort }) => {
					try {
						const results = await this.github_search_provider!.search(
							{
								query,
								search_type,
								limit,
								sort,
							} as any,
						);
						const safe_results = handle_large_result(
							results,
							'github_search',
						);
						return {
							content: [
								{
									type: 'text' as const,
									text: JSON.stringify(safe_results, null, 2),
								},
							],
						};
					} catch (error) {
						const error_response = create_error_response(
							error as Error,
						);
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
		}

		// Register AI search tool
		if (this.ai_search_provider) {
			server.tool(
				{
					name: 'ai_search',
					description: this.ai_search_provider.description,
					schema: v.object({
						query: v.pipe(v.string(), v.description('Query')),
						provider: v.pipe(
							v.union([
								v.literal('perplexity'),
								v.literal('kagi_fastgpt'),
								v.literal('exa_answer'),
							]),
							v.description('AI provider'),
						),
						limit: v.optional(
							v.pipe(v.number(), v.description('Result limit')),
						),
					}),
				},
				async ({ query, provider, limit }) => {
					try {
						const results = await this.ai_search_provider!.search({
							query,
							provider,
							limit,
						} as any);
						const safe_results = handle_large_result(
							results,
							'ai_search',
						);
						return {
							content: [
								{
									type: 'text' as const,
									text: JSON.stringify(safe_results, null, 2),
								},
							],
						};
					} catch (error) {
						const error_response = create_error_response(
							error as Error,
						);
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
		}

		// Register Firecrawl process tool
		if (this.firecrawl_process_provider) {
			server.tool(
				{
					name: 'firecrawl_process',
					description: this.firecrawl_process_provider.description,
					schema: v.object({
						url: v.pipe(
							v.union([v.string(), v.array(v.string())]),
							v.description('URL(s)'),
						),
						mode: v.pipe(
							v.union([
								v.literal('scrape'),
								v.literal('crawl'),
								v.literal('map'),
								v.literal('extract'),
								v.literal('actions'),
							]),
							v.description('Processing mode'),
						),
						extract_depth: v.optional(
							v.pipe(
								v.union([v.literal('basic'), v.literal('advanced')]),
								v.description('Extraction depth'),
							),
						),
					}),
				},
				async ({ url, mode, extract_depth }) => {
					try {
						const result =
							await this.firecrawl_process_provider!.process_content(
								url,
								extract_depth,
								mode as any,
							);
						const safe_result = handle_large_result(
							result,
							'firecrawl_process',
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
						const error_response = create_error_response(
							error as Error,
						);
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
		}

		// Register Exa process tool
		if (this.exa_process_provider) {
			server.tool(
				{
					name: 'exa_process',
					description: this.exa_process_provider.description,
					schema: v.object({
						url: v.pipe(
							v.union([v.string(), v.array(v.string())]),
							v.description('URL(s)'),
						),
						mode: v.pipe(
							v.union([v.literal('contents'), v.literal('similar')]),
							v.description('Processing mode'),
						),
						extract_depth: v.optional(
							v.pipe(
								v.union([v.literal('basic'), v.literal('advanced')]),
								v.description('Extraction depth'),
							),
						),
					}),
				},
				async ({ url, mode, extract_depth }) => {
					try {
						const result =
							await this.exa_process_provider!.process_content(
								url,
								extract_depth,
								mode as any,
							);
						const safe_result = handle_large_result(
							result,
							'exa_process',
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
						const error_response = create_error_response(
							error as Error,
						);
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
		}

		// Register remaining processing providers (kagi_summarizer, tavily_extract)
		this.processing_providers.forEach((provider) => {
			server.tool(
				{
					name: `${provider.name}_process`,
					description: provider.description,
					schema: v.object({
						url: v.pipe(
							v.union([v.string(), v.array(v.string())]),
							v.description('URL(s)'),
						),
						extract_depth: v.optional(
							v.pipe(
								v.union([v.literal('basic'), v.literal('advanced')]),
								v.description('Extraction depth'),
							),
						),
					}),
				},
				async ({ url, extract_depth }) => {
					try {
						const result = await provider.process_content(
							url,
							extract_depth,
						);
						const safe_result = handle_large_result(
							result,
							provider.name,
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
						const error_response = create_error_response(
							error as Error,
						);
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
		});

		// Register enhancement providers
		this.enhancement_providers.forEach((provider) => {
			server.tool(
				{
					name: `${provider.name}_enhance`,
					description: provider.description,
					schema: v.object({
						content: v.pipe(v.string(), v.description('Content')),
					}),
				},
				async ({ content }) => {
					try {
						const result = await provider.enhance_content(content);
						const safe_result = handle_large_result(
							result,
							provider.name,
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
						const error_response = create_error_response(
							error as Error,
						);
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
		});
	}
}

// Create singleton instance
const registry = new ToolRegistry();

export const register_tools = (server: McpServer<GenericSchema>) => {
	registry.setup_tool_handlers(server);
};

// Export methods to register providers
export const register_web_search_provider = (
	provider: SearchProvider,
) => {
	registry.register_web_search_provider(provider);
};

export const register_github_search_provider = (
	provider: SearchProvider,
) => {
	registry.register_github_search_provider(provider);
};

export const register_ai_search_provider = (
	provider: SearchProvider,
) => {
	registry.register_ai_search_provider(provider);
};

export const register_firecrawl_process_provider = (
	provider: UnifiedFirecrawlProcessingProvider,
) => {
	registry.register_firecrawl_process_provider(provider);
};

export const register_exa_process_provider = (
	provider: UnifiedExaProcessingProvider,
) => {
	registry.register_exa_process_provider(provider);
};

export const register_processing_provider = (
	provider: ProcessingProvider,
) => {
	registry.register_processing_provider(provider);
};

export const register_enhancement_provider = (
	provider: EnhancementProvider,
) => {
	registry.register_enhancement_provider(provider);
};
