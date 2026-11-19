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
	{
		provider: 'helve',
		name: 'helve_search',
		description:
			'Search the web via Helve (supports auto, fusion, or a specific upstream provider).',
		method: 'POST',
		path: '/v1/search',
		source: 'https://helve.dev/openapi.json',
		query: [],
		inputSchema: {
			type: 'object',
			properties: {
				query: { type: 'string', minLength: 1 },
				provider: {
					type: 'string',
					enum: [
						'auto',
						'fusion',
						'exa',
						'parallel',
						'tavily',
						'brave',
						'serper',
						'firecrawl',
						'linkup',
						'valyu',
						'jina',
						'octen',
						'perplexity',
					],
				},
				max_results: { type: 'integer', minimum: 1, maximum: 100 },
				mode: {
					type: 'string',
					enum: ['instant', 'fast', 'balanced', 'deep'],
				},
				include_domains: {
					type: 'array',
					items: { type: 'string', minLength: 1 },
				},
				exclude_domains: {
					type: 'array',
					items: { type: 'string', minLength: 1 },
				},
			},
			required: ['query'],
			additionalProperties: false,
		},
	},
	{
		provider: 'helve',
		name: 'helve_extract',
		description:
			'Extract markdown or text excerpts from 1-20 URLs via Helve.',
		method: 'POST',
		path: '/v1/extract',
		source: 'https://helve.dev/openapi.json',
		query: [],
		inputSchema: {
			type: 'object',
			properties: {
				urls: {
					type: 'array',
					items: { type: 'string' },
					minItems: 1,
					maxItems: 20,
				},
				provider: {
					type: 'string',
					enum: [
						'auto',
						'exa',
						'tavily',
						'parallel',
						'serper',
						'firecrawl',
						'linkup',
						'valyu',
						'jina',
						'octen',
					],
				},
				query: { type: 'string', minLength: 1 },
				content: {
					type: 'object',
					properties: {
						full_text: { type: 'boolean' },
						max_chars: {
							type: 'integer',
							minimum: 100,
							maximum: 100000,
						},
						summary: { type: 'boolean' },
						format: { type: 'string', enum: ['markdown', 'text'] },
					},
					additionalProperties: false,
				},
			},
			required: ['urls'],
			additionalProperties: false,
		},
	},
	{
		provider: 'helve',
		name: 'helve_tools_search',
		description:
			'Search available tools in the Helve catalog.',
		method: 'POST',
		path: '/v1/tools/search',
		source: 'https://helve.dev/openapi.json',
		query: [],
		inputSchema: {
			type: 'object',
			properties: {
				query: { type: 'string', minLength: 1, maxLength: 500 },
				category: { type: 'string' },
				limit: { type: 'integer', minimum: 1, maximum: 30 },
			},
			required: ['query'],
			additionalProperties: false,
		},
	},
	{
		provider: 'helve',
		name: 'helve_tools_call',
		description:
			'Invoke a Helve tool by tool_id.',
		method: 'POST',
		path: '/v1/tools/call',
		source: 'https://helve.dev/openapi.json',
		query: [],
		inputSchema: {
			type: 'object',
			properties: {
				tool_id: { type: 'string', minLength: 1 },
				arguments: { type: 'object' },
			},
			required: ['tool_id'],
			additionalProperties: false,
		},
	},
];
