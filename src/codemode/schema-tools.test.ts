import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProviderConnection } from './providers.js';
import {
	create_provider_tools,
	provider_operations,
} from './schema-tools.js';

const connections: Record<string, ProviderConnection> = {
	tavily: {
		base_url: 'https://api.tavily.com',
		api_key: 'test-tavily',
		timeout: 1000,
	},
	exa: {
		base_url: 'https://api.exa.ai',
		api_key: 'test-exa',
		header: 'x-api-key',
		prefix: '',
		timeout: 1000,
	},
	firecrawl: {
		base_url: 'https://api.firecrawl.dev/v2',
		api_key: 'test-firecrawl',
		timeout: 1000,
	},
	github: {
		base_url: 'https://api.github.com',
		api_key: 'test-github',
		timeout: 1000,
	},
	brave: {
		base_url: 'https://api.search.brave.com/res/v1',
		api_key: 'test-brave',
		header: 'X-Subscription-Token',
		prefix: '',
		timeout: 1000,
	},
	kagi: {
		base_url: 'https://kagi.com/api/v1',
		api_key: 'test-kagi',
		timeout: 1000,
	},
	linkup: {
		base_url: 'https://api.linkup.so',
		api_key: 'test-linkup',
		timeout: 1000,
	},
};
const tools = create_provider_tools(connections);
const context = () => ({ signal: new AbortController().signal });
const tool = (name: string) =>
	tools.find((candidate) => candidate.name === name)!;
const samples: Record<string, Record<string, unknown>> = {
	brave_search: { q: 'test', count: 2 },
	exa_answer: { query: 'test' },
	exa_contents: { urls: ['https://example.com'] },
	exa_search: { query: 'test', numResults: 2 },
	exa_similar: { url: 'https://example.com' },
	firecrawl_crawl: { url: 'https://example.com' },
	firecrawl_crawl_status: { id: 'job-1' },
	firecrawl_extract: {
		urls: ['https://example.com'],
		prompt: 'Find names',
	},
	firecrawl_extract_status: { id: 'job-1' },
	firecrawl_map: { url: 'https://example.com' },
	firecrawl_scrape: {
		url: 'https://example.com',
		actions: [{ type: 'wait', milliseconds: 100 }],
	},
	github_search_code: { q: 'test', per_page: 2 },
	github_search_repositories: { q: 'test' },
	github_search_users: { q: 'test' },
	kagi_search: { query: 'test', limit: 2 },
	linkup_search: {
		q: 'test',
		depth: 'standard',
		outputType: 'sourcedAnswer',
	},
	tavily_crawl: { url: 'https://example.com' },
	tavily_extract: { urls: ['https://example.com'] },
	tavily_map: { url: 'https://example.com' },
	tavily_research: { input: 'test' },
	tavily_research_status: { request_id: 'job-1' },
	tavily_search: { query: 'test', max_results: 2 },
};

afterEach(() => vi.unstubAllGlobals());

describe('schema-generated provider functions', () => {
	it('generates only the reviewed operation allowlist and configured providers', () => {
		expect(tools.map((entry) => entry.name).sort()).toEqual(
			Object.keys(samples).sort(),
		);
		expect(create_provider_tools({})).toEqual([]);
		expect(
			create_provider_tools({
				tavily: { ...connections.tavily, api_key: '  ' },
			}),
		).toEqual([]);
		expect(
			create_provider_tools({ exa: connections.exa }).map(
				(entry) => entry.name,
			),
		).toEqual(expect.arrayContaining(['exa_search', 'exa_contents']));
		expect(
			tools.some((entry) =>
				/delete|cancel|monitor|credit/.test(entry.name),
			),
		).toBe(false);
	});

	it.each(provider_operations)(
		'$name validates and serializes its native API request',
		async (operation) => {
			const fetch_mock = vi.fn().mockResolvedValue(
				Response.json({
					raw: { provider: operation.provider },
					results: [],
				}),
			);
			vi.stubGlobal('fetch', fetch_mock);
			const args = samples[operation.name];
			const result = await tool(operation.name).execute(
				args,
				context(),
			);
			expect(result).toEqual({
				raw: { provider: operation.provider },
				results: [],
			});
			expect(fetch_mock).toHaveBeenCalledOnce();
			const [url, options] = fetch_mock.mock.calls[0] as unknown as [
				string,
				RequestInit,
			];
			const connection = connections[operation.provider];
			expect(url).toMatch(new RegExp(`^${connection.base_url}`));
			expect(options.method).toBe(operation.method);
			expect(options.redirect).toBe('error');
			expect(options.headers).toMatchObject({
				[connection.header ?? 'Authorization']:
					`${connection.prefix ?? 'Bearer '}${connection.api_key}`,
			});
			if (operation.method === 'POST') {
				expect(JSON.parse(options.body as string)).toEqual(args);
			} else {
				expect(options.body).toBeUndefined();
				for (const name of operation.query) {
					if (args[name] !== undefined)
						expect(new URL(url).searchParams.get(name)).toBe(
							typeof args[name] === 'string'
								? args[name]
								: JSON.stringify(args[name]),
						);
				}
				expect(url).not.toContain('{');
			}
		},
	);

	it.each([
		['tavily_search', { max_results: 2 }],
		['tavily_search', { query: 'test', max_results: '2' }],
		['tavily_search', { query: 'test', api_key: 'override' }],
		[
			'tavily_search',
			{ query: 'test', base_url: 'https://elsewhere.invalid' },
		],
		['brave_search', { q: 'test', count: 100 }],
		[
			'firecrawl_scrape',
			{ url: 'https://example.com', unknown_field: true },
		],
		[
			'linkup_search',
			{ q: 'test', depth: 'invalid', outputType: 'sourcedAnswer' },
		],
	] as const)(
		'rejects invalid arguments for %s before requesting',
		async (name, args) => {
			const fetch_mock = vi.fn();
			vi.stubGlobal('fetch', fetch_mock);
			await expect(
				tool(name).execute(args, context()),
			).rejects.toThrow('Invalid');
			expect(fetch_mock).not.toHaveBeenCalled();
		},
	);

	it('encodes path IDs and rejects path traversal', async () => {
		const fetch_mock = vi
			.fn()
			.mockImplementation(() => Response.json({ status: 'pending' }));
		vi.stubGlobal('fetch', fetch_mock);
		await tool('firecrawl_crawl_status').execute(
			{ id: 'job/one?x=2' },
			context(),
		);
		expect(fetch_mock.mock.calls[0][0]).toBe(
			'https://api.firecrawl.dev/v2/crawl/job%2Fone%3Fx%3D2',
		);
		await expect(
			tool('firecrawl_crawl_status').execute({ id: '..' }, context()),
		).rejects.toThrow('Invalid path');
		expect(fetch_mock).toHaveBeenCalledOnce();
	});

	it('does not retry paid requests or expose authentication failures verbatim', async () => {
		const fetch_mock = vi
			.fn()
			.mockResolvedValue(
				Response.json({ error: 'test-tavily' }, { status: 401 }),
			);
		vi.stubGlobal('fetch', fetch_mock);
		await expect(
			tool('tavily_search').execute({ query: 'test' }, context()),
		).rejects.toThrow('Invalid API key');
		expect(fetch_mock).toHaveBeenCalledOnce();
	});

	it('rejects streaming and already aborted requests before fetching', async () => {
		const fetch_mock = vi.fn();
		vi.stubGlobal('fetch', fetch_mock);
		await expect(
			tool('exa_answer').execute(
				{ query: 'test', stream: true },
				context(),
			),
		).rejects.toThrow('Streaming');
		const controller = new AbortController();
		controller.abort();
		await expect(
			tool('tavily_search').execute(
				{ query: 'test' },
				{ signal: controller.signal },
			),
		).rejects.toThrow();
		expect(fetch_mock).not.toHaveBeenCalled();
	});
});
