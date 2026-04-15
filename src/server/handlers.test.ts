import { describe, expect, it } from 'vitest';
import { setup_handlers } from './handlers.js';
import { available_providers } from './tools/index.js';

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
};

describe('setup_handlers', () => {
	it('registers provider status and provider info resources', async () => {
		reset_available_providers();
		available_providers.search.add('brave');
		available_providers.ai_response.add('linkup');
		available_providers.processing.add('firecrawl');

		const { resources, server } = create_mock_server();
		setup_handlers(server as any);

		expect(
			resources.map((resource) => resource.definition.name),
		).toEqual(['provider-status', 'provider-info']);

		const provider_status = resources.find(
			(resource) => resource.definition.name === 'provider-status',
		)!;
		const status_response = await provider_status.handler();
		const status_body = JSON.parse(status_response.contents[0].text);

		expect(status_body).toEqual({
			status: 'operational',
			providers: {
				search: ['brave'],
				ai_response: ['linkup'],
				processing: ['firecrawl'],
			},
			available_count: {
				search: 1,
				ai_response: 1,
				processing: 1,
				total: 3,
			},
		});
	});

	it('returns provider information for available providers', async () => {
		reset_available_providers();
		available_providers.search.add('kagi');

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
			status: 'active',
			capabilities: ['web_search', 'news_search'],
			rate_limits: {
				requests_per_minute: 60,
				requests_per_day: 1000,
			},
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
		).rejects.toThrow(
			'Provider not available: missing (missing API key)',
		);

		await expect(
			provider_info.handler('omnisearch://unknown/resource'),
		).rejects.toThrow(
			'Unknown resource URI: omnisearch://unknown/resource',
		);
	});
});
