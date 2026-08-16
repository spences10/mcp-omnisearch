import { describe, expect, it, vi } from 'vitest';
import type { ResolvedMcpBackend } from '../../../config/mcp-backends.js';
import {
	McpBackendSearchProvider,
	create_mcp_backend_definitions,
} from './index.js';

const backend: ResolvedMcpBackend = {
	id: 'exa_mcp',
	kind: 'http',
	transport_url: 'https://mcp.exa.ai/mcp',
	headers: { 'x-api-key': 'exa-key' },
	env: {},
	tool: 'web_search_exa',
	query_argument: 'query',
	limit_argument: 'numResults',
	static_arguments: { type: 'auto' },
	result_path: ['results'],
	field_aliases: {
		title: ['title'],
		url: ['url'],
		snippet: ['text'],
		score: ['score'],
	},
	timeout: 30_000,
	estimated_cost: 0.01,
};

describe('McpBackendSearchProvider', () => {
	it('calls the mapped tool and normalizes results', async () => {
		const call_tool = vi.fn(async () => ({
			structuredContent: {
				results: [
					{
						title: 'Example',
						url: 'https://example.com',
						text: 'Hello',
						score: 0.9,
					},
				],
			},
		}));

		const provider = new McpBackendSearchProvider(backend, call_tool);

		await expect(
			provider.search({ query: '  sveltekit\nremote  ', limit: 3 }),
		).resolves.toEqual([
			{
				title: 'Example',
				url: 'https://example.com',
				snippet: 'Hello',
				score: 0.9,
				source_provider: 'exa_mcp',
			},
		]);
		expect(call_tool).toHaveBeenCalledWith({
			backend,
			tool: 'web_search_exa',
			arguments: {
				type: 'auto',
				query: 'sveltekit remote',
				numResults: 3,
			},
		});
	});

	it('creates registry definitions without requiring an API key field', () => {
		const definitions = create_mcp_backend_definitions({
			EXA_API_KEY: 'exa-key',
			OMNISEARCH_MCP_BACKENDS: JSON.stringify({
				exa_mcp: {
					transport: 'https://mcp.exa.ai/mcp',
					tool: 'web_search_exa',
				},
			}),
		});

		expect(definitions).toEqual([
			expect.objectContaining({
				id: 'exa_mcp',
				requires_api_key: false,
				api_key_name: 'OMNISEARCH_MCP_BACKENDS',
				tools: ['web_search'],
			}),
		]);
	});
});
