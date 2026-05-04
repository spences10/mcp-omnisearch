import { describe, expect, it } from 'vitest';
import { setup_handlers } from './handlers.js';
import type { ProviderStatus } from './provider-registry.js';
import {
	available_providers,
	provider_status_entries,
} from './tools/index.js';

interface RegisteredResource {
	definition: { name: string; uri: string };
	handler: (...args: any[]) => Promise<any>;
}

const create_mock_server = () => {
	const resources: RegisteredResource[] = [];
	return {
		resources,
		server: {
			resource: (
				definition: RegisteredResource['definition'],
				handler: RegisteredResource['handler'],
			) => {
				resources.push({ definition, handler });
			},
		},
	};
};

const reset_available_providers = () => {
	available_providers.search.clear();
	available_providers.ai_response.clear();
	available_providers.processing.clear();
	provider_status_entries.length = 0;
};

const provider_status = (
	overrides: Partial<ProviderStatus>,
): ProviderStatus => ({
	id: 'brave',
	name: 'brave',
	category: 'search',
	status: 'available',
	api_key_name: 'BRAVE_API_KEY',
	tools: ['web_search'],
	modes: [],
	capabilities: ['web_search'],
	...overrides,
});

describe('setup_handlers', () => {
	it('registers provider status and provider info resources', async () => {
		reset_available_providers();
		provider_status_entries.push(
			provider_status({
				id: 'brave',
				name: 'brave',
				category: 'search',
				api_key_name: 'BRAVE_API_KEY',
			}),
			provider_status({
				id: 'linkup',
				name: 'linkup',
				category: 'ai_response',
				api_key_name: 'LINKUP_API_KEY',
				tools: ['ai_search'],
				capabilities: ['answer_generation'],
			}),
			provider_status({
				id: 'firecrawl:scrape',
				name: 'firecrawl',
				category: 'processing',
				status: 'unavailable',
				api_key_name: 'FIRECRAWL_API_KEY',
				tools: ['web_extract'],
				modes: ['scrape'],
				capabilities: ['scraping'],
				unavailable_reason: 'missing_api_key',
			}),
		);

		const { resources, server } = create_mock_server();
		setup_handlers(server as any);

		expect(
			resources.map((resource) => resource.definition.name),
		).toEqual(['provider-status', 'provider-info']);

		const provider_status_resource = resources.find(
			(resource) => resource.definition.name === 'provider-status',
		)!;
		const status_response = await provider_status_resource.handler();
		const status_body = JSON.parse(status_response.contents[0].text);

		expect(status_body.status).toBe('degraded');
		expect(status_body.providers.search).toEqual([
			expect.objectContaining({
				name: 'brave',
				status: 'available',
				api_key_name: 'BRAVE_API_KEY',
				tools: ['web_search'],
			}),
		]);
		expect(status_body.providers.ai_response).toEqual([
			expect.objectContaining({
				name: 'linkup',
				status: 'available',
				tools: ['ai_search'],
			}),
		]);
		expect(status_body.providers.processing).toEqual([
			expect.objectContaining({
				name: 'firecrawl',
				status: 'unavailable',
				api_key_name: 'FIRECRAWL_API_KEY',
				unavailable_reason: 'missing_api_key',
			}),
		]);
		expect(status_body.available_count).toEqual({
			search: 1,
			ai_response: 1,
			processing: 0,
			total: 2,
		});
		expect(status_body.unavailable_count).toEqual({
			search: 0,
			ai_response: 0,
			processing: 1,
			total: 1,
		});
	});

	it('returns provider information for available providers', async () => {
		reset_available_providers();
		provider_status_entries.push(
			provider_status({
				id: 'kagi',
				name: 'kagi',
				api_key_name: 'KAGI_API_KEY',
				capabilities: ['web_search', 'operator_passthrough'],
			}),
			provider_status({
				id: 'kagi:summarize',
				name: 'kagi',
				category: 'processing',
				api_key_name: 'KAGI_API_KEY',
				tools: ['web_extract'],
				modes: ['summarize'],
				capabilities: ['summarization'],
			}),
		);

		const { resources, server } = create_mock_server();
		setup_handlers(server as any);

		const provider_info = resources.find(
			(resource) => resource.definition.name === 'provider-info',
		)!;
		const response = await provider_info.handler(
			'omnisearch://search/kagi/info',
		);
		const body = JSON.parse(response.contents[0].text);

		expect(body).toEqual({
			name: 'kagi',
			status: 'available',
			categories: ['search'],
			tools: ['web_search'],
			modes: [],
			capabilities: ['operator_passthrough', 'web_search'],
			providers: [
				expect.objectContaining({
					id: 'kagi',
					name: 'kagi',
					category: 'search',
					status: 'available',
					api_key_name: 'KAGI_API_KEY',
				}),
			],
		});
	});

	it('throws for unavailable providers and unknown URIs', async () => {
		reset_available_providers();

		const { resources, server } = create_mock_server();
		setup_handlers(server as any);

		const provider_info = resources.find(
			(resource) => resource.definition.name === 'provider-info',
		)!;

		await expect(
			provider_info.handler('omnisearch://search/missing/info'),
		).rejects.toThrow('Unknown provider: missing');

		await expect(
			provider_info.handler('omnisearch://unknown/resource'),
		).rejects.toThrow(
			'Unknown resource URI: omnisearch://unknown/resource',
		);
	});
});
