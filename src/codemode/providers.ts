import { config } from '../config/env.js';

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
	tavily: { ...config.search.tavily, timeout: 150_000 },
	brave: {
		...config.search.brave,
		header: 'X-Subscription-Token',
		prefix: '',
	},
	kagi: config.search.kagi,
	github: config.search.github,
	exa: { ...config.search.exa, header: 'x-api-key', prefix: '' },
	linkup: {
		...config.ai_response.linkup,
		base_url: 'https://api.linkup.so',
	},
	firecrawl: {
		...config.processing.firecrawl_scrape,
		base_url: config.processing.firecrawl_scrape.base_url.replace(
			/\/scrape$/,
			'',
		),
		timeout: 120_000,
	},
});
