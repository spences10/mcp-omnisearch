import {
	BaseSearchParams,
	ErrorType,
	ProviderError,
	SearchProvider,
	SearchResult,
} from '../../../common/types.js';
import {
	delay,
	handle_rate_limit,
	retry_with_backoff,
	sanitize_query,
	validate_api_key,
} from '../../../common/utils.js';
import { config } from '../../../config/env.js';

interface RedditTokenResponse {
	access_token: string;
	token_type: string;
	expires_in: number;
	scope: string;
}

interface RedditSearchResponse {
	data: {
		children: Array<{
			data: {
				title: string;
				url: string;
				selftext: string;
				permalink: string;
				subreddit: string;
				score: number;
				num_comments: number;
				created_utc: number;
				author: string;
			};
		}>;
		after?: string;
		before?: string;
	};
}

interface RateLimitInfo {
	remaining: number;
	reset: Date;
	used: number;
}

export class RedditSearchProvider implements SearchProvider {
	name = 'reddit';
	description =
		'Search Reddit posts and comments. Requires OAuth2 authentication with client ID and secret. Best for finding community discussions, technical Q&A, and user experiences. Supports subreddit filtering, time range, and sorting options.';

	private access_token?: string;
	private token_expires_at?: Date;
	private rate_limit: RateLimitInfo = {
		remaining: 60,
		reset: new Date(Date.now() + 60000),
		used: 0,
	};

	private async get_access_token(): Promise<string> {
		// Check if we have a valid token
		if (
			this.access_token &&
			this.token_expires_at &&
			this.token_expires_at > new Date()
		) {
			return this.access_token;
		}

		// Validate credentials
		const client_id = validate_api_key(
			config.search.reddit.client_id,
			`${this.name}_client_id`,
		);
		const client_secret = validate_api_key(
			config.search.reddit.client_secret,
			`${this.name}_client_secret`,
		);

		// Get new token using client credentials flow
		const auth = Buffer.from(`${client_id}:${client_secret}`).toString(
			'base64',
		);

		try {
			const response = await fetch(
				'https://www.reddit.com/api/v1/access_token',
				{
					method: 'POST',
					headers: {
						Authorization: `Basic ${auth}`,
						'Content-Type': 'application/x-www-form-urlencoded',
						'User-Agent': config.search.reddit.user_agent,
					},
					body: 'grant_type=client_credentials',
					signal: AbortSignal.timeout(10000),
				},
			);

			if (!response.ok) {
				throw new ProviderError(
					ErrorType.API_ERROR,
					`Failed to get Reddit access token: ${response.statusText}`,
					this.name,
				);
			}

			const data: RedditTokenResponse = await response.json();
			this.access_token = data.access_token;
			// Set expiration time with a small buffer
			this.token_expires_at = new Date(
				Date.now() + (data.expires_in - 60) * 1000,
			);

			return data.access_token;
		} catch (error) {
			if (error instanceof ProviderError) {
				throw error;
			}
			throw new ProviderError(
				ErrorType.API_ERROR,
				`Failed to authenticate with Reddit: ${
					error instanceof Error ? error.message : 'Unknown error'
				}`,
				this.name,
			);
		}
	}

	private check_rate_limit(): void {
		// Reset rate limit if the reset time has passed
		if (new Date() > this.rate_limit.reset) {
			this.rate_limit = {
				remaining: 60,
				reset: new Date(Date.now() + 60000), // 1 minute window
				used: 0,
			};
		}

		// Check if we have requests remaining
		if (this.rate_limit.remaining <= 0) {
			handle_rate_limit(this.name, this.rate_limit.reset);
		}
	}

	private update_rate_limit(headers: Headers): void {
		const remaining = headers.get('x-ratelimit-remaining');
		const reset = headers.get('x-ratelimit-reset');
		const used = headers.get('x-ratelimit-used');

		if (remaining !== null) {
			this.rate_limit.remaining = parseInt(remaining, 10);
		}
		if (reset !== null) {
			this.rate_limit.reset = new Date(parseInt(reset, 10) * 1000);
		}
		if (used !== null) {
			this.rate_limit.used = parseInt(used, 10);
		}
	}

	async search(params: BaseSearchParams): Promise<SearchResult[]> {
		// Check rate limit before making request
		this.check_rate_limit();

		const search_request = async () => {
			try {
				// Get access token
				const access_token = await this.get_access_token();

				// Sanitize and prepare query
				const query = sanitize_query(params.query);

				// Build search parameters
				const search_params = new URLSearchParams({
					q: query,
					limit: (params.limit ?? 25).toString(),
					sort: params.sort_by ?? 'relevance', // relevance, hot, top, new, comments
					t: params.time_range ?? 'all', // hour, day, week, month, year, all
					type: 'link', // link (posts) or comment
					include_over_18: 'false',
				});

				// Add subreddit filter if specified
				if (params.subreddit) {
					search_params.set('restrict_sr', 'true');
				}

				// Determine the search URL
				const base_url = params.subreddit
					? `https://oauth.reddit.com/r/${params.subreddit}/search`
					: 'https://oauth.reddit.com/search';

				const response = await fetch(
					`${base_url}?${search_params}`,
					{
						method: 'GET',
						headers: {
							Authorization: `Bearer ${access_token}`,
							'User-Agent': config.search.reddit.user_agent,
						},
						signal: AbortSignal.timeout(
							config.search.reddit.timeout,
						),
					},
				);

				// Update rate limit info from response headers
				this.update_rate_limit(response.headers);

				if (response.status === 429) {
					// Rate limited
					const retry_after = response.headers.get('retry-after');
					const reset_time = retry_after
						? new Date(
								Date.now() + parseInt(retry_after, 10) * 1000,
							)
						: this.rate_limit.reset;
					handle_rate_limit(this.name, reset_time);
				}

				if (!response.ok) {
					throw new ProviderError(
						ErrorType.API_ERROR,
						`Reddit API error: ${response.statusText}`,
						this.name,
					);
				}

				const data: RedditSearchResponse = await response.json();

				// Transform Reddit posts to SearchResult format
				return data.data.children.map((child) => {
					const post = child.data;
					const snippet = post.selftext
						? post.selftext.substring(0, 200) +
							(post.selftext.length > 200 ? '...' : '')
						: `Posted in r/${post.subreddit} by u/${post.author} • ${post.score} points • ${post.num_comments} comments`;

					return {
						title: post.title,
						url: post.url.startsWith('/r/')
							? `https://www.reddit.com${post.url}`
							: post.url,
						snippet,
						source_provider: this.name,
						metadata: {
							subreddit: post.subreddit,
							score: post.score,
							comments: post.num_comments,
							permalink: `https://www.reddit.com${post.permalink}`,
							created: new Date(
								post.created_utc * 1000,
							).toISOString(),
						},
					};
				});
			} catch (error) {
				if (error instanceof ProviderError) {
					throw error;
				}
				throw new ProviderError(
					ErrorType.API_ERROR,
					`Reddit search failed: ${
						error instanceof Error ? error.message : 'Unknown error'
					}`,
					this.name,
				);
			}
		};

		return retry_with_backoff(search_request, 2, 2000);
	}
}

// Extend BaseSearchParams for Reddit-specific parameters
declare module '../../../common/types.js' {
	interface BaseSearchParams {
		subreddit?: string;
		sort_by?: 'relevance' | 'hot' | 'top' | 'new' | 'comments';
		time_range?: 'hour' | 'day' | 'week' | 'month' | 'year' | 'all';
	}
}