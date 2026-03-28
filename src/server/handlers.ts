import { McpServer } from 'tmcp';
import type { GenericSchema } from 'valibot';
import { available_providers } from './tools/index.js';

export const setup_handlers = (server: McpServer<GenericSchema>) => {
	// Provider Status Resource
	server.resource(
		{
			name: 'provider-status',
			description: 'Current status of all search providers',
			uri: 'omnisearch://providers/status',
		},
		async () => {
			return {
				contents: [
					{
						uri: 'omnisearch://providers/status',
						mimeType: 'application/json',
						text: JSON.stringify(
							{
								status: 'operational',
								providers: {
									search: Array.from(available_providers.search),
									ai_response: Array.from(
										available_providers.ai_response,
									),
									processing: Array.from(
										available_providers.processing,
									),
								},
								available_count: {
									search: available_providers.search.size,
									ai_response: available_providers.ai_response.size,
									processing: available_providers.processing.size,
									total:
										available_providers.search.size +
										available_providers.ai_response.size +
										available_providers.processing.size,
								},
							},
							null,
							2,
						),
					},
				],
			};
		},
	);

	// Provider Info Resource Template
	server.resource(
		{
			name: 'provider-info',
			description: 'Information about a specific search provider',
			uri: 'omnisearch://search/{provider}/info',
		},
		async (uri) => {
			// Handle provider info template
			const providerMatch = uri.match(
				/^omnisearch:\/\/search\/([^/]+)\/info$/,
			);
			if (providerMatch) {
				const providerName = providerMatch[1];

				// Check if provider is available
				const isAvailable =
					available_providers.search.has(providerName) ||
					available_providers.ai_response.has(providerName);

				if (!isAvailable) {
					throw new Error(
						`Provider not available: ${providerName} (missing API key)`,
					);
				}

				return {
					contents: [
						{
							uri,
							mimeType: 'application/json',
							text: JSON.stringify(
								{
									name: providerName,
									status: 'active',
									capabilities: ['web_search', 'news_search'],
									rate_limits: {
										requests_per_minute: 60,
										requests_per_day: 1000,
									},
								},
								null,
								2,
							),
						},
					],
				};
			}

			throw new Error(`Unknown resource URI: ${uri}`);
		},
	);
};
