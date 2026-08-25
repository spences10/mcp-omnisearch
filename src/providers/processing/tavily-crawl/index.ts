import * as v from 'valibot';
import { handle_provider_error } from '../../../common/errors.js';
import { http_json } from '../../../common/http.js';
import { parse_provider_response } from '../../../common/provider-response.js';
import { retry_with_backoff } from '../../../common/retry.js';
import {
	ErrorType,
	ProcessingProvider,
	ProcessingResult,
	ProviderError,
} from '../../../common/types.js';
import {
	validate_api_key,
	validate_processing_urls,
} from '../../../common/validation.js';
import { config } from '../../../config/env.js';

const tavily_crawl_response_schema = v.object({
	base_url: v.string(),
	results: v.array(
		v.object({
			url: v.string(),
			raw_content: v.nullable(v.string()),
			favicon: v.optional(v.nullable(v.string())),
		}),
	),
	response_time: v.union([v.number(), v.string()]),
	request_id: v.optional(v.string()),
	usage: v.optional(
		v.object({
			credits: v.number(),
		}),
	),
});

export class TavilyCrawlProvider implements ProcessingProvider {
	name = 'tavily_crawl';
	description =
		'Crawl a website with Tavily graph-based discovery and content extraction. Best for documentation indexing and multi-page site analysis.';

	async process_content(
		url: string | string[],
		extract_depth: 'basic' | 'advanced' = 'basic',
	): Promise<ProcessingResult> {
		const [crawl_url] = validate_processing_urls(url, this.name);

		const crawl_request = async () => {
			const api_key = validate_api_key(
				config.processing.tavily_crawl.api_key,
				this.name,
			);

			try {
				const raw_data = await http_json(
					this.name,
					`${config.processing.tavily_crawl.base_url}/crawl`,
					{
						method: 'POST',
						headers: {
							Authorization: `Bearer ${api_key}`,
							'Content-Type': 'application/json',
						},
						body: JSON.stringify({
							url: crawl_url,
							max_depth: extract_depth === 'advanced' ? 3 : 1,
							max_breadth: extract_depth === 'advanced' ? 50 : 20,
							limit: extract_depth === 'advanced' ? 50 : 20,
							extract_depth,
							format: 'markdown',
							include_favicon: true,
							include_usage: true,
						}),
						signal: AbortSignal.timeout(
							config.processing.tavily_crawl.timeout,
						),
					},
				);
				const data = parse_provider_response(
					this.name,
					tavily_crawl_response_schema,
					raw_data,
				);

				const successful_results = data.results.filter(
					(
						result,
					): result is typeof result & { raw_content: string } =>
						typeof result.raw_content === 'string' &&
						result.raw_content.length > 0,
				);
				if (successful_results.length === 0) {
					throw new ProviderError(
						ErrorType.PROVIDER_ERROR,
						'Crawl returned no content',
						this.name,
					);
				}

				const raw_contents = successful_results.map((result) => ({
					url: result.url,
					content: result.raw_content,
				}));
				const content = raw_contents
					.map((result) => `# ${result.url}\n\n${result.content}`)
					.join('\n\n---\n\n');
				const favicons = Object.fromEntries(
					successful_results
						.filter((result) => result.favicon)
						.map((result) => [result.url, result.favicon]),
				);
				const failed_urls = data.results
					.filter((result) => !result.raw_content)
					.map((result) => result.url);

				return {
					content,
					raw_contents,
					metadata: {
						word_count: content.split(/\s+/).filter(Boolean).length,
						urls_processed: data.results.length,
						successful_extractions: successful_results.length,
						failed_urls:
							failed_urls.length > 0 ? failed_urls : undefined,
						extract_depth,
						response_time: data.response_time,
						...(data.request_id
							? { request_id: data.request_id }
							: {}),
						...(data.usage ? { usage: data.usage } : {}),
						...(Object.keys(favicons).length > 0 ? { favicons } : {}),
					},
					source_provider: this.name,
				};
			} catch (error) {
				handle_provider_error(error, this.name, 'crawl website');
			}
		};

		return retry_with_backoff(crawl_request);
	}
}
