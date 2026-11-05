import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from 'vitest';
import { provider_connections } from './providers.js';

const keys = {
	tavily: 'TAVILY_API_KEY',
	brave: 'BRAVE_API_KEY',
	kagi: 'KAGI_API_KEY',
	github: 'GITHUB_API_KEY',
	exa: 'EXA_API_KEY',
	linkup: 'LINKUP_API_KEY',
	firecrawl: 'FIRECRAWL_API_KEY',
};

beforeEach(() => {
	for (const [name, key] of Object.entries(keys))
		vi.stubEnv(key, `test-key-${name}`);
	vi.stubEnv('FIRECRAWL_BASE_URL', undefined);
});

afterEach(() => vi.unstubAllEnvs());

describe('native provider connections', () => {
	it('preserves credential names, origins, authentication and timeouts', () => {
		const connections = provider_connections();
		expect(Object.keys(connections)).toEqual(Object.keys(keys));
		for (const name of Object.keys(keys))
			expect(connections[name].api_key).toBe(`test-key-${name}`);
		expect(connections.tavily).toMatchObject({
			base_url: 'https://api.tavily.com',
			timeout: 150_000,
		});
		expect(connections.brave).toMatchObject({
			base_url: 'https://api.search.brave.com/res/v1',
			header: 'X-Subscription-Token',
			prefix: '',
			timeout: 10_000,
		});
		expect(connections.kagi).toMatchObject({
			base_url: 'https://kagi.com/api/v1',
			timeout: 20_000,
		});
		expect(connections.github).toMatchObject({
			base_url: 'https://api.github.com',
			timeout: 20_000,
		});
		expect(connections.exa).toMatchObject({
			base_url: 'https://api.exa.ai',
			header: 'x-api-key',
			prefix: '',
			timeout: 30_000,
		});
		expect(connections.linkup).toMatchObject({
			base_url: 'https://api.linkup.so',
			timeout: 30_000,
		});
		expect(connections.firecrawl).toMatchObject({
			base_url: 'https://api.firecrawl.dev/v2',
			timeout: 120_000,
		});
	});

	it.each(['http://localhost:3002', 'http://localhost:3002/'])(
		'routes self-hosted Firecrawl at %s to v2',
		(base_url) => {
			vi.stubEnv('FIRECRAWL_BASE_URL', base_url);
			expect(provider_connections().firecrawl.base_url).toBe(
				'http://localhost:3002/v2',
			);
		},
	);

	it('leaves missing credentials unavailable', () => {
		vi.stubEnv('TAVILY_API_KEY', undefined);
		expect(provider_connections().tavily.api_key).toBeUndefined();
	});
});
