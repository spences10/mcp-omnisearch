import { McpServer } from 'tmcp';
import type { GenericSchema } from 'valibot';
import type {
	ProviderCategory,
	ProviderStatus,
} from './provider-registry.js';
import { provider_status_entries } from './tools/index.js';

const categories: ProviderCategory[] = [
	'search',
	'ai_response',
	'processing',
];

const unique = (values: readonly string[]) =>
	Array.from(new Set(values)).sort();

const grouped_provider_status = () => {
	const grouped: Record<ProviderCategory, ProviderStatus[]> = {
		search: [],
		ai_response: [],
		processing: [],
	};

	for (const provider of provider_status_entries) {
		grouped[provider.category].push(provider);
	}

	return grouped;
};

const aggregate_provider_info = (
	provider_name: string,
	category?: ProviderCategory,
) => {
	const entries = provider_status_entries.filter(
		(provider) =>
			(provider.id === provider_name ||
				provider.name === provider_name) &&
			(!category || provider.category === category),
	);

	if (entries.length === 0) return undefined;

	const status = entries.some(
		(provider) => provider.status === 'available',
	)
		? 'available'
		: 'unavailable';

	return {
		name: provider_name,
		status,
		categories: unique(entries.map((provider) => provider.category)),
		tools: unique(entries.flatMap((provider) => provider.tools)),
		modes: unique(entries.flatMap((provider) => provider.modes)),
		capabilities: unique(
			entries.flatMap((provider) => provider.capabilities),
		),
		providers: entries.map((provider) => ({
			id: provider.id,
			name: provider.name,
			category: provider.category,
			status: provider.status,
			api_key_name: provider.api_key_name,
			description: provider.description,
			tools: provider.tools,
			modes: provider.modes,
			capabilities: provider.capabilities,
			unavailable_reason: provider.unavailable_reason,
		})),
	};
};

export const setup_handlers = (server: McpServer<GenericSchema>) => {
	// Provider Status Resource
	server.resource(
		{
			name: 'provider-status',
			description: 'Current status of all configured providers',
			uri: 'omnisearch://providers/status',
		},
		async () => {
			const providers = grouped_provider_status();
			const available_count = Object.fromEntries(
				categories.map((category) => [
					category,
					providers[category].filter(
						(provider) => provider.status === 'available',
					).length,
				]),
			) as Record<ProviderCategory, number>;
			const unavailable_count = Object.fromEntries(
				categories.map((category) => [
					category,
					providers[category].filter(
						(provider) => provider.status === 'unavailable',
					).length,
				]),
			) as Record<ProviderCategory, number>;
			const total = provider_status_entries.length;
			const available_total = categories.reduce(
				(sum, category) => sum + available_count[category],
				0,
			);

			return {
				contents: [
					{
						uri: 'omnisearch://providers/status',
						mimeType: 'application/json',
						text: JSON.stringify(
							{
								status:
									available_total === 0
										? 'unavailable'
										: available_total === total
											? 'operational'
											: 'degraded',
								providers,
								available_count: {
									...available_count,
									total: available_total,
								},
								unavailable_count: {
									...unavailable_count,
									total: total - available_total,
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
			description: 'Information about a specific configured provider',
			uri: 'omnisearch://providers/{provider}/info',
		},
		async (uri) => {
			const providerMatch = uri.match(
				/^omnisearch:\/\/(providers|search|ai_response|processing)\/([^/]+)\/info$/,
			);
			if (providerMatch) {
				const [, scope, providerName] = providerMatch;
				const category =
					scope === 'providers'
						? undefined
						: (scope as ProviderCategory);
				const providerInfo = aggregate_provider_info(
					providerName,
					category,
				);

				if (!providerInfo) {
					throw new Error(`Unknown provider: ${providerName}`);
				}

				return {
					contents: [
						{
							uri,
							mimeType: 'application/json',
							text: JSON.stringify(providerInfo, null, 2),
						},
					],
				};
			}

			throw new Error(`Unknown resource URI: ${uri}`);
		},
	);
};
