export const mockTavilySearchResponse = {
	results: [
		{
			title: 'Example Search Result',
			url: 'https://example.com/article',
			content: 'This is an example search result content',
			score: 0.9,
			published_date: '2024-01-01',
		},
		{
			title: 'Another Search Result',
			url: 'https://example.org/page',
			content: 'Another example content',
			score: 0.8,
			published_date: '2024-01-02',
		},
	],
	query: 'test query',
};

export const mockBraveSearchResponse = {
	web: {
		results: [
			{
				title: 'Brave Search Result',
				url: 'https://brave-example.com',
				description: 'Description from Brave Search',
				is_source_local: false,
				is_source_both: false,
				language: 'en',
				profile: {
					name: 'Example Site',
					url: 'https://brave-example.com',
					long_name: 'Example Site Long Name',
					img: 'https://brave-example.com/favicon.ico',
				},
				meta_url: {
					scheme: 'https',
					netloc: 'brave-example.com',
					hostname: 'brave-example.com',
					favicon: 'https://brave-example.com/favicon.ico',
					path: '/',
				},
			},
		],
	},
};

export const mockKagiSearchResponse = {
	data: [
		{
			t: 0,
			rank: 1,
			url: 'https://kagi-example.com',
			title: 'Kagi Search Result',
			snippet: 'Snippet from Kagi search',
			published: '2024-01-01T00:00:00Z',
		},
	],
};

export const mockPerplexityResponse = {
	id: 'test-id',
	model: 'llama-3.1-sonar-small-128k-online',
	created: Date.now(),
	usage: {
		prompt_tokens: 50,
		completion_tokens: 100,
		total_tokens: 150,
	},
	object: 'chat.completion',
	choices: [
		{
			index: 0,
			finish_reason: 'stop',
			message: {
				role: 'assistant',
				content: 'This is a mock Perplexity AI response.',
			},
			delta: {
				role: 'assistant',
				content: '',
			},
		},
	],
};

export const mockKagiFastGPTResponse = {
	data: {
		output: 'This is a mock Kagi FastGPT response.',
		tokens: 25,
		references: [
			{
				title: 'Reference 1',
				snippet: 'Reference snippet',
				url: 'https://reference1.com',
			},
		],
	},
};

export const mockJinaReaderResponse = {
	code: 200,
	status: 20000,
	data: {
		title: 'Example Article Title',
		description: 'Article description',
		url: 'https://example.com/article',
		content: 'This is the clean content extracted by Jina Reader.',
		usage: {
			tokens: 500,
		},
	},
};

export const mockFirecrawlScrapeResponse = {
	success: true,
	data: {
		markdown: '# Example Title\n\nThis is example content.',
		html: '<h1>Example Title</h1><p>This is example content.</p>',
		rawHtml: '<html><head><title>Example</title></head><body>...</body></html>',
		metadata: {
			title: 'Example Title',
			description: 'Example description',
			language: 'en',
			sourceURL: 'https://example.com',
		},
		llm_extraction: null,
		warning: null,
	},
};

export const mockFirecrawlCrawlResponse = {
	success: true,
	id: 'crawl-123',
	url: 'https://api.firecrawl.dev/v1/crawl/crawl-123',
};

export const mockFirecrawlCrawlStatusResponse = {
	success: true,
	status: 'completed',
	completed: 5,
	total: 5,
	creditsUsed: 5,
	expiresAt: '2024-12-31T23:59:59.000Z',
	data: [
		{
			markdown: '# Page 1\n\nContent of page 1',
			metadata: {
				title: 'Page 1',
				sourceURL: 'https://example.com/page1',
			},
		},
		{
			markdown: '# Page 2\n\nContent of page 2',
			metadata: {
				title: 'Page 2',
				sourceURL: 'https://example.com/page2',
			},
		},
	],
};

export const mockErrorResponses = {
	unauthorized: {
		message: 'Invalid API key',
		error: 'Unauthorized',
		status: 401,
	},
	rateLimited: {
		message: 'Rate limit exceeded',
		error: 'Too Many Requests',
		status: 429,
		retry_after: 60,
	},
	badRequest: {
		message: 'Invalid request parameters',
		error: 'Bad Request',
		status: 400,
	},
	internalError: {
		message: 'Internal server error',
		error: 'Internal Server Error',
		status: 500,
	},
};