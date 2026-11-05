export interface ProviderConnection {
	base_url: string;
	api_key: string | undefined;
	header?: string;
	prefix?: string;
	timeout: number;
}

// Origins and authentication never come from model-written code or API specs.
export const provider_connections = (): Record<
	string,
	ProviderConnection
> => ({
	tavily: {
		base_url: 'https://api.tavily.com',
		api_key: process.env.TAVILY_API_KEY,
		timeout: 150_000,
	},
	brave: {
		base_url: 'https://api.search.brave.com/res/v1',
		api_key: process.env.BRAVE_API_KEY,
		header: 'X-Subscription-Token',
		prefix: '',
		timeout: 10_000,
	},
	kagi: {
		base_url: 'https://kagi.com/api/v1',
		api_key: process.env.KAGI_API_KEY,
		timeout: 20_000,
	},
	github: {
		base_url: 'https://api.github.com',
		api_key: process.env.GITHUB_API_KEY,
		timeout: 20_000,
	},
	exa: {
		base_url: 'https://api.exa.ai',
		api_key: process.env.EXA_API_KEY,
		header: 'x-api-key',
		prefix: '',
		timeout: 30_000,
	},
	linkup: {
		base_url: 'https://api.linkup.so',
		api_key: process.env.LINKUP_API_KEY,
		timeout: 30_000,
	},
	firecrawl: {
		base_url: `${(process.env.FIRECRAWL_BASE_URL ?? 'https://api.firecrawl.dev').replace(/\/+$/, '')}/v2`,
		api_key: process.env.FIRECRAWL_API_KEY,
		timeout: 120_000,
	},
});
