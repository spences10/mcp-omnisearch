import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
	CallToolRequestSchema,
	ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import {
	BaseSearchParams,
	EnhancementProvider,
	ProcessingProvider,
	SearchProvider,
} from '../common/types.js';
import { create_error_response } from '../common/utils.js';
import { search_orchestrator } from '../common/search-orchestrator.js';
import { provider_config } from '../config/provider-config.js';
import { query_analyzer } from '../common/query-analyzer.js';
import { performance_tracker } from '../common/performance-tracker.js';

// Track available providers by category
export const available_providers = {
	search: new Set<string>(),
	ai_response: new Set<string>(),
	processing: new Set<string>(),
	enhancement: new Set<string>(),
};

class ToolRegistry {
	private search_providers: Map<string, SearchProvider> = new Map();
	private processing_providers: Map<string, ProcessingProvider> =
		new Map();
	private enhancement_providers: Map<string, EnhancementProvider> =
		new Map();

	register_search_provider(
		provider: SearchProvider,
		is_ai_response = false,
	) {
		this.search_providers.set(provider.name, provider);
		search_orchestrator.register_search_provider(provider, is_ai_response);
		if (is_ai_response) {
			available_providers.ai_response.add(provider.name);
		} else {
			available_providers.search.add(provider.name);
		}
	}

	register_processing_provider(provider: ProcessingProvider) {
		this.processing_providers.set(provider.name, provider);
		available_providers.processing.add(provider.name);
	}

	register_enhancement_provider(provider: EnhancementProvider) {
		this.enhancement_providers.set(provider.name, provider);
		available_providers.enhancement.add(provider.name);
	}

	setup_tool_handlers(server: Server) {
		// Register tool list handler
		server.setRequestHandler(ListToolsRequestSchema, async () => {
			const mode = provider_config.get_mode();
			const is_unified = mode === 'unified';
			const tools = [];

			// Always include mode management tools
			tools.push({
				name: 'get_mode',
				description: 'Get the current provider mode (unified or direct).',
				inputSchema: {
					type: 'object',
					properties: {},
				},
			});

			tools.push({
				name: 'set_mode',
				description: 'Switch between unified mode (single search interface) and direct mode (individual provider tools).',
				inputSchema: {
					type: 'object',
					properties: {
						mode: {
							type: 'string',
							enum: ['unified', 'direct'],
							description: 'The mode to switch to',
						},
					},
					required: ['mode'],
				},
			});

			if (is_unified) {
				// In unified mode, only show unified tools
				tools.push({
					name: 'unified_search',
					description: 'Intelligent search with automatic provider fallback. Tries multiple search providers in order of preference based on query type and provider availability. Handles rate limits, API errors, and credit exhaustion gracefully by falling back to alternative providers.',
					inputSchema: {
						type: 'object',
						properties: {
							query: {
								type: 'string',
								description: 'Search query',
							},
							limit: {
								type: 'number',
								description: 'Maximum number of results to return',
								minimum: 1,
								maximum: 50,
							},
							include_domains: {
								type: 'array',
								items: { type: 'string' },
								description: 'List of domains to include in search results',
							},
							exclude_domains: {
								type: 'array',
								items: { type: 'string' },
								description: 'List of domains to exclude from search results',
							},
						},
						required: ['query'],
					},
				},
				{
					name: 'unified_ai_search',
					description: 'Intelligent AI-powered search with automatic provider fallback. Uses AI response providers (Perplexity, Kagi FastGPT) to provide comprehensive answers with automatic fallback when providers are rate-limited or unavailable.',
					inputSchema: {
						type: 'object',
						properties: {
							query: {
								type: 'string',
								description: 'Search query for AI response',
							},
							limit: {
								type: 'number',
								description: 'Maximum number of results to return',
								minimum: 1,
								maximum: 50,
							},
							include_domains: {
								type: 'array',
								items: { type: 'string' },
								description: 'List of domains to include in search results',
							},
							exclude_domains: {
								type: 'array',
								items: { type: 'string' },
								description: 'List of domains to exclude from search results',
							},
						},
						required: ['query'],
					},
				},
				{
					name: 'provider_health',
					description: 'Get the current health status of all search providers, including availability, rate limit status, and error history.',
					inputSchema: {
						type: 'object',
						properties: {},
					},
				},
				{
					name: 'reset_provider_health',
					description: 'Reset the health status of a specific provider (useful for clearing rate limits or error states).',
					inputSchema: {
						type: 'object',
						properties: {
							provider_name: {
								type: 'string',
								description: 'Name of the provider to reset',
							},
						},
						required: ['provider_name'],
					},
				},
				{
					name: 'configure_providers',
					description: 'Configure search provider settings including order, enabled status, and preferences.',
					inputSchema: {
						type: 'object',
						properties: {
							provider_order: {
								type: 'array',
								items: { type: 'string' },
								description: 'Array of provider names in priority order (e.g., ["kagi", "tavily", "brave"])',
							},
							disabled_providers: {
								type: 'array',
								items: { type: 'string' },
								description: 'Array of provider names to disable',
							},
							fallback_enabled: {
								type: 'boolean',
								description: 'Enable/disable automatic fallback to other providers',
							},
							category: {
								type: 'string',
								enum: ['search', 'ai_response'],
								description: 'Category of providers to configure (search or ai_response)',
							},
						},
					},
				},
				{
					name: 'get_provider_config',
					description: 'Get current provider configuration including order, enabled status, and settings.',
					inputSchema: {
						type: 'object',
						properties: {},
					},
				},
				{
					name: 'analyze_query',
					description: 'Analyze a search query to understand its type, complexity, and recommend the best provider.',
					inputSchema: {
						type: 'object',
						properties: {
							query: {
								type: 'string',
								description: 'The query to analyze',
							},
						},
						required: ['query'],
					},
				},
				{
					name: 'performance_insights',
					description: 'Get performance insights and statistics about provider usage and success rates.',
					inputSchema: {
						type: 'object',
						properties: {},
					},
				});
			} else {
				// In direct mode, show all individual provider tools
				tools.push(
					...Array.from(this.search_providers.values()).map(
					(provider) => ({
						name: `${provider.name}_search`,
						description: provider.description,
						inputSchema: {
							type: 'object',
							properties: {
								query: {
									type: 'string',
									description: 'Search query',
								},
								limit: {
									type: 'number',
									description: 'Maximum number of results to return',
									minimum: 1,
									maximum: 50,
								},
								include_domains: {
									type: 'array',
									items: { type: 'string' },
									description:
										'List of domains to include in search results',
								},
								exclude_domains: {
									type: 'array',
									items: { type: 'string' },
									description:
										'List of domains to exclude from search results',
								},
							},
							required: ['query'],
						},
					}),
					),
					...Array.from(this.processing_providers.values()).map(
					(provider) => ({
						name: `${provider.name}_process`,
						description: provider.description,
						inputSchema: {
							type: 'object',
							properties: {
								url: {
									oneOf: [
										{
											type: 'string',
											description: 'Single URL to process',
										},
										{
											type: 'array',
											items: {
												type: 'string',
											},
											description: 'Multiple URLs to process',
										},
									],
								},
								extract_depth: {
									type: 'string',
									enum: ['basic', 'advanced'],
									default: 'basic',
									description:
										'The depth of the extraction process. "advanced" retrieves more data but costs more credits.',
								},
							},
							required: ['url'],
						},
					}),
				),
				...Array.from(this.enhancement_providers.values()).map(
					(provider) => ({
						name: `${provider.name}_enhance`,
						description: provider.description,
						inputSchema: {
							type: 'object',
							properties: {
								content: {
									type: 'string',
									description: 'Content to enhance',
								},
							},
							required: ['content'],
						},
					}),
					)
				);

				// Add management tools in direct mode
				tools.push(
					{
						name: 'unified_search',
						description: 'Intelligent search with automatic provider fallback. Tries multiple search providers in order of preference based on query type and provider availability.',
						inputSchema: {
							type: 'object',
							properties: {
								query: {
									type: 'string',
									description: 'Search query',
								},
								limit: {
									type: 'number',
									description: 'Maximum number of results to return',
									minimum: 1,
									maximum: 50,
								},
								include_domains: {
									type: 'array',
									items: { type: 'string' },
									description: 'List of domains to include in search results',
								},
								exclude_domains: {
									type: 'array',
									items: { type: 'string' },
									description: 'List of domains to exclude from search results',
								},
							},
							required: ['query'],
						},
					},
					{
						name: 'unified_ai_search',
						description: 'Intelligent AI-powered search with automatic provider fallback.',
						inputSchema: {
							type: 'object',
							properties: {
								query: {
									type: 'string',
									description: 'Search query for AI response',
								},
								limit: {
									type: 'number',
									description: 'Maximum number of results to return',
									minimum: 1,
									maximum: 50,
								},
								include_domains: {
									type: 'array',
									items: { type: 'string' },
									description: 'List of domains to include in search results',
								},
								exclude_domains: {
									type: 'array',
									items: { type: 'string' },
									description: 'List of domains to exclude from search results',
								},
							},
							required: ['query'],
						},
					},
					{
						name: 'provider_health',
						description: 'Get the current health status of all search providers.',
						inputSchema: {
							type: 'object',
							properties: {},
						},
					},
					{
						name: 'reset_provider_health',
						description: 'Reset the health status of a specific provider.',
						inputSchema: {
							type: 'object',
							properties: {
								provider_name: {
									type: 'string',
									description: 'Name of the provider to reset',
								},
							},
							required: ['provider_name'],
						},
					},
					{
						name: 'configure_providers',
						description: 'Configure search provider settings.',
						inputSchema: {
							type: 'object',
							properties: {
								provider_order: {
									type: 'array',
									items: { type: 'string' },
									description: 'Array of provider names in priority order',
								},
								disabled_providers: {
									type: 'array',
									items: { type: 'string' },
									description: 'Array of provider names to disable',
								},
								fallback_enabled: {
									type: 'boolean',
									description: 'Enable/disable automatic fallback',
								},
								category: {
									type: 'string',
									enum: ['search', 'ai_response'],
									description: 'Category of providers to configure',
								},
							},
						},
					},
					{
						name: 'get_provider_config',
						description: 'Get current provider configuration.',
						inputSchema: {
							type: 'object',
							properties: {},
						},
					},
					{
						name: 'analyze_query',
						description: 'Analyze a search query to understand its type and recommend providers.',
						inputSchema: {
							type: 'object',
							properties: {
								query: {
									type: 'string',
									description: 'The query to analyze',
								},
							},
							required: ['query'],
						},
					},
					{
						name: 'performance_insights',
						description: 'Get performance insights and statistics.',
						inputSchema: {
							type: 'object',
							properties: {},
						},
					}
				);
			}

			return { tools };
		});

		// Register tool call handler
		server.setRequestHandler(
			CallToolRequestSchema,
			async (request) => {
				try {
					// Split from the right to handle provider names that contain underscores
					const parts = request.params.name.split('_');
					const action = parts.pop()!; // Get last part as action
					const provider_name = parts.join('_'); // Join remaining parts as provider name
					const args = request.params.arguments;

					if (!args || typeof args !== 'object') {
						return {
							content: [
								{
									type: 'text',
									text: 'Missing or invalid arguments',
								},
							],
							isError: true,
						};
					}

					// Handle mode management tools
					if (request.params.name === 'get_mode') {
						const mode = provider_config.get_mode();
						return {
							content: [
								{
									type: 'text',
									text: JSON.stringify({
										mode,
										description: mode === 'unified' 
											? 'Unified mode - single search interface with intelligent provider selection'
											: 'Direct mode - individual provider tools for explicit control',
									}, null, 2),
								},
							],
						};
					}

					if (request.params.name === 'set_mode') {
						if (!('mode' in args) || (args.mode !== 'unified' && args.mode !== 'direct')) {
							return {
								content: [
									{
										type: 'text',
										text: 'Invalid mode. Must be "unified" or "direct"',
									},
								],
								isError: true,
							};
						}

						provider_config.set_mode(args.mode);
						return {
							content: [
								{
									type: 'text',
									text: JSON.stringify({
										message: `Mode switched to ${args.mode}`,
										mode: args.mode,
										note: args.mode === 'unified' 
											? 'Now using unified search interface. Individual provider tools are hidden.'
											: 'Now using direct provider access. All individual provider tools are available.',
									}, null, 2),
								},
							],
						};
					}

					// Handle unified search tools
					if (request.params.name === 'unified_search') {
						if (
							!('query' in args) ||
							typeof args.query !== 'string'
						) {
							return {
								content: [
									{
										type: 'text',
										text: 'Missing or invalid query parameter',
									},
								],
								isError: true,
							};
						}

						const search_params: BaseSearchParams = {
							query: args.query,
							limit:
								typeof args.limit === 'number'
									? args.limit
									: undefined,
							include_domains: Array.isArray(args.include_domains)
								? args.include_domains
								: undefined,
							exclude_domains: Array.isArray(args.exclude_domains)
								? args.exclude_domains
								: undefined,
						};

						const result = await search_orchestrator.unified_search(search_params);
						return {
							content: [
								{
									type: 'text',
									text: JSON.stringify(result, null, 2),
								},
							],
							isError: !result.success,
						};
					}

					if (request.params.name === 'unified_ai_search') {
						if (
							!('query' in args) ||
							typeof args.query !== 'string'
						) {
							return {
								content: [
									{
										type: 'text',
										text: 'Missing or invalid query parameter',
									},
								],
								isError: true,
							};
						}

						const search_params: BaseSearchParams = {
							query: args.query,
							limit:
								typeof args.limit === 'number'
									? args.limit
									: undefined,
							include_domains: Array.isArray(args.include_domains)
								? args.include_domains
								: undefined,
							exclude_domains: Array.isArray(args.exclude_domains)
								? args.exclude_domains
								: undefined,
						};

						const result = await search_orchestrator.unified_ai_search(search_params);
						return {
							content: [
								{
									type: 'text',
									text: JSON.stringify(result, null, 2),
								},
							],
							isError: !result.success,
						};
					}

					if (request.params.name === 'provider_health') {
						const health_status = search_orchestrator.get_provider_health();
						return {
							content: [
								{
									type: 'text',
									text: JSON.stringify(health_status, null, 2),
								},
							],
						};
					}

					if (request.params.name === 'reset_provider_health') {
						if (
							!('provider_name' in args) ||
							typeof args.provider_name !== 'string'
						) {
							return {
								content: [
									{
										type: 'text',
										text: 'Missing or invalid provider_name parameter',
									},
								],
								isError: true,
							};
						}

						search_orchestrator.reset_provider_health(args.provider_name);
						return {
							content: [
								{
									type: 'text',
									text: `Provider health reset for: ${args.provider_name}`,
								},
							],
						};
					}

					if (request.params.name === 'configure_providers') {
						const category = (args.category as 'search' | 'ai_response') || 'search';
						
						// Update provider order if specified
						if (Array.isArray(args.provider_order)) {
							provider_config.set_provider_order(args.provider_order, category);
						}

						// Disable providers if specified
						if (Array.isArray(args.disabled_providers)) {
							for (const provider of args.disabled_providers) {
								provider_config.update_provider_config(provider, { enabled: false });
							}
						}

						// Update fallback setting if specified
						if (typeof args.fallback_enabled === 'boolean') {
							const current_config = provider_config.get_config();
							current_config.fallback_enabled = args.fallback_enabled;
						}

						return {
							content: [
								{
									type: 'text',
									text: JSON.stringify({
										message: 'Provider configuration updated',
										current_config: provider_config.get_config(),
									}, null, 2),
								},
							],
						};
					}

					if (request.params.name === 'get_provider_config') {
						const config = provider_config.get_config();
						const health = search_orchestrator.get_provider_health();
						
						return {
							content: [
								{
									type: 'text',
									text: JSON.stringify({
										configuration: config,
										provider_health: health,
										search_order: provider_config.get_providers_by_priority('search'),
										ai_response_order: provider_config.get_providers_by_priority('ai_response'),
									}, null, 2),
								},
							],
						};
					}

					if (request.params.name === 'analyze_query') {
						if (!('query' in args) || typeof args.query !== 'string') {
							return {
								content: [
									{
										type: 'text',
										text: 'Missing or invalid query parameter',
									},
								],
								isError: true,
							};
						}

						const characteristics = query_analyzer.analyze_query(args.query);
						const available = provider_config.get_providers_by_priority('search');
						const recommendation = query_analyzer.get_recommended_provider(args.query, available);
						const scores = query_analyzer.score_providers(characteristics, available);

						return {
							content: [
								{
									type: 'text',
									text: JSON.stringify({
										query: args.query,
										analysis: characteristics,
										recommendation,
										provider_scores: scores,
									}, null, 2),
								},
							],
						};
					}

					if (request.params.name === 'performance_insights') {
						const insights = performance_tracker.get_provider_insights();
						const stats = performance_tracker.get_all_provider_performance();
						const exported_stats = JSON.parse(performance_tracker.export_statistics());
						
						return {
							content: [
								{
									type: 'text',
									text: JSON.stringify({
										insights,
										provider_statistics: stats,
										detailed_export: exported_stats,
									}, null, 2),
								},
							],
						};
					}

					switch (action) {
						case 'search': {
							const provider =
								this.search_providers.get(provider_name);
							if (!provider) {
								return {
									content: [
										{
											type: 'text',
											text: `Unknown search provider: ${provider_name}`,
										},
									],
									isError: true,
								};
							}

							// Type guard for search parameters
							if (
								!('query' in args) ||
								typeof args.query !== 'string'
							) {
								return {
									content: [
										{
											type: 'text',
											text: 'Missing or invalid query parameter',
										},
									],
									isError: true,
								};
							}

							const search_params: BaseSearchParams = {
								query: args.query,
								limit:
									typeof args.limit === 'number'
										? args.limit
										: undefined,
								include_domains: Array.isArray(args.include_domains)
									? args.include_domains
									: undefined,
								exclude_domains: Array.isArray(args.exclude_domains)
									? args.exclude_domains
									: undefined,
							};

							const results = await provider.search(search_params);
							return {
								content: [
									{
										type: 'text',
										text: JSON.stringify(results, null, 2),
									},
								],
							};
						}

						case 'process': {
							const provider =
								this.processing_providers.get(provider_name);
							if (!provider) {
								return {
									content: [
										{
											type: 'text',
											text: `Unknown processing provider: ${provider_name}`,
										},
									],
									isError: true,
								};
							}

							if (
								!('url' in args) ||
								(typeof args.url !== 'string' &&
									!Array.isArray(args.url))
							) {
								return {
									content: [
										{
											type: 'text',
											text: 'Missing or invalid URL parameter',
										},
									],
									isError: true,
								};
							}

							const result = await provider.process_content(
								args.url,
								args.extract_depth as 'basic' | 'advanced',
							);
							return {
								content: [
									{
										type: 'text',
										text: JSON.stringify(result, null, 2),
									},
								],
							};
						}

						case 'enhance': {
							const provider =
								this.enhancement_providers.get(provider_name);
							if (!provider) {
								return {
									content: [
										{
											type: 'text',
											text: `Unknown enhancement provider: ${provider_name}`,
										},
									],
									isError: true,
								};
							}

							if (
								!('content' in args) ||
								typeof args.content !== 'string'
							) {
								return {
									content: [
										{
											type: 'text',
											text: 'Missing or invalid content parameter',
										},
									],
									isError: true,
								};
							}

							const result = await provider.enhance_content(
								args.content,
							);
							return {
								content: [
									{
										type: 'text',
										text: JSON.stringify(result, null, 2),
									},
								],
							};
						}

						default:
							return {
								content: [
									{ type: 'text', text: `Unknown action: ${action}` },
								],
								isError: true,
							};
					}
				} catch (error) {
					const error_response = create_error_response(
						error as Error,
					);
					return {
						content: [{ type: 'text', text: error_response.error }],
						isError: true,
					};
				}
			},
		);
	}
}

// Create singleton instance
const registry = new ToolRegistry();

export const register_tools = (server: Server) => {
	registry.setup_tool_handlers(server);
};

// Export methods to register providers
export const register_search_provider = (
	provider: SearchProvider,
	is_ai_response = false,
) => {
	registry.register_search_provider(provider, is_ai_response);
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
