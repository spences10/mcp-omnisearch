// Environment variable configuration for the MCP Omnisearch server

// Search provider API keys
export const TAVILY_API_KEY = process.env.TAVILY_API_KEY;
export const BRAVE_API_KEY = process.env.BRAVE_API_KEY;
export const KAGI_API_KEY = process.env.KAGI_API_KEY;
export const GITHUB_API_KEY = process.env.GITHUB_API_KEY;
export const EXA_API_KEY = process.env.EXA_API_KEY;
export const LINKUP_API_KEY = process.env.LINKUP_API_KEY;

// Content processing API keys
export const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY;
export const FIRECRAWL_BASE_URL = process.env.FIRECRAWL_BASE_URL;

// Provider configuration
export const config = {
	search: {
		tavily: {
			api_key: TAVILY_API_KEY,
			base_url: 'https://api.tavily.com',
			timeout: 30000, // 30 seconds
		},
		brave: {
			api_key: BRAVE_API_KEY,
			base_url: 'https://api.search.brave.com/res/v1',
			timeout: 10000, // 10 seconds
		},
		kagi: {
			api_key: KAGI_API_KEY,
			base_url: 'https://kagi.com/api/v0',
			timeout: 20000, // 20 seconds
		},
		github: {
			api_key: GITHUB_API_KEY,
			base_url: 'https://api.github.com',
			timeout: 20000, // 20 seconds
		},
		exa: {
			api_key: EXA_API_KEY,
			base_url: 'https://api.exa.ai',
			timeout: 30000, // 30 seconds
		},
	},
	ai_response: {
		kagi_fastgpt: {
			api_key: KAGI_API_KEY,
			base_url: 'https://kagi.com/api/v0/fastgpt',
			timeout: 30000, // 30 seconds
		},
		exa_answer: {
			api_key: EXA_API_KEY,
			base_url: 'https://api.exa.ai',
			timeout: 30000, // 30 seconds
		},
		linkup: {
			api_key: LINKUP_API_KEY,
			base_url: 'https://api.linkup.so/v1',
			timeout: 30000, // 30 seconds
		},
	},
	processing: {
		kagi_summarizer: {
			api_key: KAGI_API_KEY,
			base_url: 'https://kagi.com/api/v0/summarize',
			timeout: 30000, // 30 seconds
		},
		tavily_extract: {
			api_key: TAVILY_API_KEY,
			base_url: 'https://api.tavily.com',
			timeout: 30000, // 30 seconds
		},
		firecrawl_scrape: {
			api_key: FIRECRAWL_API_KEY,
			base_url: FIRECRAWL_BASE_URL
				? `${FIRECRAWL_BASE_URL}/v2/scrape`
				: 'https://api.firecrawl.dev/v2/scrape',
			timeout: 60000, // 60 seconds - web scraping can take longer
		},
		firecrawl_crawl: {
			api_key: FIRECRAWL_API_KEY,
			base_url: FIRECRAWL_BASE_URL
				? `${FIRECRAWL_BASE_URL}/v2/crawl`
				: 'https://api.firecrawl.dev/v2/crawl',
			timeout: 120000, // 120 seconds - crawling can take even longer
		},
		firecrawl_map: {
			api_key: FIRECRAWL_API_KEY,
			base_url: FIRECRAWL_BASE_URL
				? `${FIRECRAWL_BASE_URL}/v2/map`
				: 'https://api.firecrawl.dev/v2/map',
			timeout: 60000, // 60 seconds
		},
		firecrawl_extract: {
			api_key: FIRECRAWL_API_KEY,
			base_url: FIRECRAWL_BASE_URL
				? `${FIRECRAWL_BASE_URL}/v2/extract`
				: 'https://api.firecrawl.dev/v2/extract',
			timeout: 60000, // 60 seconds
		},
		firecrawl_actions: {
			api_key: FIRECRAWL_API_KEY,
			base_url: FIRECRAWL_BASE_URL
				? `${FIRECRAWL_BASE_URL}/v2/scrape`
				: 'https://api.firecrawl.dev/v2/scrape',
			timeout: 90000, // 90 seconds - actions can take longer
		},
		exa_contents: {
			api_key: EXA_API_KEY,
			base_url: 'https://api.exa.ai',
			timeout: 30000, // 30 seconds
		},
		exa_similar: {
			api_key: EXA_API_KEY,
			base_url: 'https://api.exa.ai',
			timeout: 30000, // 30 seconds
		},
	},
	enhancement: {
		kagi_enrichment: {
			api_key: KAGI_API_KEY,
			base_url: 'https://kagi.com/api/v0/enrich',
			timeout: 20000, // 20 seconds
		},
	},
};

// Validate required environment variables
export const validate_config = () => {
	const missing_keys: string[] = [];
	const available_keys: string[] = [];

	// Check search provider keys
	if (!TAVILY_API_KEY) missing_keys.push('TAVILY_API_KEY');
	else available_keys.push('TAVILY_API_KEY');

	if (!BRAVE_API_KEY) missing_keys.push('BRAVE_API_KEY');
	else available_keys.push('BRAVE_API_KEY');

	if (!KAGI_API_KEY) missing_keys.push('KAGI_API_KEY');
	else available_keys.push('KAGI_API_KEY');

	if (!GITHUB_API_KEY) missing_keys.push('GITHUB_API_KEY');
	else available_keys.push('GITHUB_API_KEY');

	if (!FIRECRAWL_API_KEY) missing_keys.push('FIRECRAWL_API_KEY');
	else available_keys.push('FIRECRAWL_API_KEY');

	if (!EXA_API_KEY) missing_keys.push('EXA_API_KEY');
	else available_keys.push('EXA_API_KEY');

	if (!LINKUP_API_KEY) missing_keys.push('LINKUP_API_KEY');
	else available_keys.push('LINKUP_API_KEY');

	// Log available keys
	if (available_keys.length > 0) {
		console.error(`Found API keys for: ${available_keys.join(', ')}`);
	} else {
		console.error(
			'Warning: No API keys found. No providers will be available.',
		);
	}

	// Log missing keys as informational
	if (missing_keys.length > 0) {
		console.warn(
			`Missing API keys for: ${missing_keys.join(
				', ',
			)}. Some providers will not be available.`,
		);
	}
};
