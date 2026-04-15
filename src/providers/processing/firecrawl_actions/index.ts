import { handle_provider_error } from '../../../common/errors.js';
import {
	make_firecrawl_request,
	validate_firecrawl_response,
} from '../../../common/firecrawl_utils.js';
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

interface FirecrawlActionsResponse {
	success: boolean;
	data?: {
		markdown?: string;
		html?: string;
		rawHtml?: string;
		screenshot?: string;
		actions?: {
			screenshots?: string[];
		};
		metadata?: {
			title?: string;
			description?: string;
			language?: string;
			sourceURL?: string;
			statusCode?: number;
			error?: string;
			[key: string]: any;
		};
	};
	error?: string;
}

// Define the action types
type ActionType =
	| 'click'
	| 'write'
	| 'scroll'
	| 'wait'
	| 'executeJavascript'
	| 'screenshot';

interface Action {
	type: ActionType;
	selector?: string;
	text?: string;
	x?: number;
	y?: number;
	milliseconds?: number;
	direction?: 'up' | 'down';
	script?: string;
}

export class FirecrawlActionsProvider implements ProcessingProvider {
	name = 'firecrawl_actions';
	description =
		'Support for page interactions (clicking, scrolling, etc.) before extraction for dynamic content using Firecrawl. Enables extraction from JavaScript-heavy sites, single-page applications, and content behind user interactions. Best for accessing content that requires navigation, form filling, or other interactions.';

	async process_content(
		url: string | string[],
		extract_depth: 'basic' | 'advanced' = 'basic',
	): Promise<ProcessingResult> {
		// Actions works with a single URL
		const urls = validate_processing_urls(url, this.name);
		const actions_url = urls[0];

		const actions_request = async () => {
			const api_key = validate_api_key(
				config.processing.firecrawl_actions.api_key,
				this.name,
			);

			try {
				// Define actions based on extract_depth
				// For basic, we'll just scroll down once to load more content
				// For advanced, we'll perform more complex interactions
				const actions: Action[] =
					extract_depth === 'advanced'
						? [
								{ type: 'wait', milliseconds: 2000 },
								{ type: 'scroll', direction: 'down' },
								{ type: 'wait', milliseconds: 1000 },
								{ type: 'scroll', direction: 'down' },
								{ type: 'wait', milliseconds: 1000 },
								{
									type: 'click',
									selector:
										'button:contains("Read more"), button:contains("Show more"), a:contains("Read more"), a:contains("Show more")',
								},
								{ type: 'wait', milliseconds: 2000 },
							]
						: [
								{ type: 'wait', milliseconds: 2000 },
								{ type: 'scroll', direction: 'down' },
								{ type: 'wait', milliseconds: 1000 },
							];

				// Start the actions
				const actions_data =
					await make_firecrawl_request<FirecrawlActionsResponse>(
						this.name,
						config.processing.firecrawl_actions.base_url,
						api_key,
						{
							url: actions_url,
							formats: ['markdown', 'screenshot'],
							actions: actions,
						},
						config.processing.firecrawl_actions.timeout,
					);

				validate_firecrawl_response(
					actions_data,
					this.name,
					'Error performing actions',
				);

				// Check if we have data
				if (!actions_data.data) {
					throw new ProviderError(
						ErrorType.PROVIDER_ERROR,
						'No data returned from API',
						this.name,
					);
				}

				// Check if we have content
				if (
					!actions_data.data.markdown &&
					!actions_data.data.html &&
					!actions_data.data.rawHtml
				) {
					throw new ProviderError(
						ErrorType.PROVIDER_ERROR,
						'No content extracted after performing actions',
						this.name,
					);
				}

				// Prefer markdown, fallback to HTML, then rawHtml
				const content =
					actions_data.data.markdown ||
					actions_data.data.html ||
					actions_data.data.rawHtml ||
					'';

				// Add information about the actions performed
				const actions_description =
					`# Content from ${actions_url} after interactions\n\n` +
					`The following actions were performed before extraction:\n\n` +
					actions
						.map((action, index) => {
							switch (action.type) {
								case 'click':
									return `${index + 1}. Click on ${action.selector || `coordinates (${action.x}, ${action.y})`}`;
								case 'write':
									return `${index + 1}. Write "${action.text}" ${action.selector ? `into ${action.selector}` : ''}`;
								case 'scroll':
									return `${index + 1}. Scroll ${action.direction || 'down'}`;
								case 'wait':
									return `${index + 1}. Wait ${action.milliseconds ? `for ${action.milliseconds}ms` : ''}`;
								case 'executeJavascript':
									return `${index + 1}. Execute JavaScript`;
								case 'screenshot':
									return `${index + 1}. Take screenshot`;
								default:
									return `${index + 1}. Perform ${String(action.type)} action`;
							}
						})
						.join('\n') +
					'\n\n---\n\n' +
					content;

				// Create a single raw_content entry
				const raw_contents = [
					{
						url: actions_url,
						content: actions_description,
					},
				];

				// Calculate word count
				const word_count = actions_description
					.split(/\s+/)
					.filter(Boolean).length;

				return {
					content: actions_description,
					raw_contents,
					metadata: {
						title: `Content from ${actions_url} after interactions`,
						word_count,
						urls_processed: 1,
						successful_extractions: 1,
						extract_depth,
						screenshot: actions_data.data.screenshot,
					},
					source_provider: this.name,
				};
			} catch (error) {
				handle_provider_error(error, this.name, 'perform actions');
			}
		};

		return retry_with_backoff(actions_request);
	}
}
