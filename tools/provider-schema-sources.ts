// Only operations already supported by Omnisearch, plus asynchronous job status.
// Adding an upstream endpoint here changes the sandbox's capability boundary.
export const provider_schema_sources = [
	{
		provider: 'tavily',
		url: 'https://docs.tavily.com/documentation/api-reference/endpoint/{operation}.md',
		operations: [
			['search', 'post', '/search'],
			['extract', 'post', '/extract'],
			['crawl', 'post', '/crawl'],
			['map', 'post', '/map'],
			['research', 'post', '/research'],
			[
				'research_status',
				'get',
				'/research/{request_id}',
				'research-get',
			],
		],
	},
	{
		provider: 'exa',
		url: 'https://exa.ai/docs/exa-spec.json',
		operations: [
			['search', 'post', '/search'],
			['answer', 'post', '/answer'],
			['contents', 'post', '/contents'],
			['similar', 'post', '/findSimilar'],
		],
	},
	{
		provider: 'firecrawl',
		url: 'https://docs.firecrawl.dev/api-reference/v2-openapi.json',
		operations: [
			['scrape', 'post', '/scrape'],
			['crawl', 'post', '/crawl'],
			['crawl_status', 'get', '/crawl/{id}'],
			['map', 'post', '/map'],
			['extract', 'post', '/extract'],
			['extract_status', 'get', '/extract/{id}'],
		],
	},
	{
		provider: 'linkup',
		url: 'https://api.linkup.so/v1/openapi.json',
		operations: [['search', 'post', '/v1/search']],
	},
	{
		provider: 'github',
		url: 'https://raw.githubusercontent.com/github/rest-api-description/main/descriptions/api.github.com/api.github.com.json',
		operations: [
			['search_code', 'get', '/search/code'],
			['search_repositories', 'get', '/search/repositories'],
			['search_users', 'get', '/search/users'],
		],
	},
] as const;

// These providers do not publish a spec at a verified public URL. Keep the
// supported request subset explicit, using their docs and existing adapters.
export const documented_provider_schemas = [
	{
		provider: 'brave',
		source:
			'https://api-dashboard.search.brave.com/app/documentation/web-search/query',
		name: 'brave_search',
		description: 'Search the web with Brave.',
		method: 'GET',
		path: '/web/search',
		query: ['q', 'count'],
		inputSchema: {
			type: 'object',
			properties: {
				q: { type: 'string', minLength: 1 },
				count: { type: 'integer', minimum: 1, maximum: 20 },
			},
			required: ['q'],
			additionalProperties: false,
		},
	},
	{
		provider: 'kagi',
		source: 'https://help.kagi.com/kagi/api/search.html',
		name: 'kagi_search',
		description: 'Search the web with Kagi.',
		method: 'POST',
		path: '/search',
		query: [],
		inputSchema: {
			type: 'object',
			properties: {
				query: { type: 'string', minLength: 1 },
				limit: { type: 'integer', minimum: 1, maximum: 50 },
			},
			required: ['query'],
			additionalProperties: false,
		},
	},
];
