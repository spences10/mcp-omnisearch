import { Octokit } from 'octokit';
import { retry_with_backoff } from '../../../common/retry.js';
import {
	BaseSearchParams,
	ErrorType,
	ProviderError,
	SearchProvider,
	SearchResult,
} from '../../../common/types.js';
import { validate_api_key } from '../../../common/validation.js';
import { config } from '../../../config/env.js';

// Interface for individual code search result item from GitHub API
interface GitHubCodeSearchResultItem {
	name: string;
	path: string;
	sha: string;
	url: string;
	git_url: string;
	html_url: string;
	score: number;
	repository: {
		full_name: string;
		html_url: string;
	};
	text_matches?: {
		object_url?: string;
		object_type?: string | null;
		property?: string;
		fragment?: string;
	}[];
}

// Interface for individual repository search result item from GitHub API
interface GitHubRepositorySearchResultItem {
	full_name: string;
	html_url: string;
	description: string | null;
	stargazers_count: number;
	forks_count: number;
	open_issues_count: number;
	pushed_at: string;
	language: string | null;
	score: number;
}

export class GitHubSearchProvider implements SearchProvider {
	name = 'github';
	description =
		'Search for code on GitHub. This is ideal for finding code examples, tracking down function definitions, or locating files with specific names or paths. Supports advanced query syntax with qualifiers like `filename:`, `path:`, `repo:`, `user:`, `language:`, and `in:file`. For example, to find a file named `settings.json` in a `.claude` directory, you could use the query: `filename:settings.json path:.claude`';

	// Main search method for code search (default behavior)
	async search(params: BaseSearchParams): Promise<SearchResult[]> {
		return this.search_code(params);
	}

	// Dedicated code search method with enhanced snippets
	async search_code(
		params: BaseSearchParams & { include_snippets?: boolean },
	): Promise<SearchResult[]> {
		const api_key = validate_api_key(
			config.search.github.api_key,
			this.name,
		);
		const octokit = new Octokit({ auth: api_key });

		const search_request = async () => {
			try {
				// Enable text matches to get better snippets
				const response = await octokit.rest.search.code({
					q: params.query,
					per_page: params.limit ?? 10,
					// Request text matches for better snippets
					headers: {
						accept: 'application/vnd.github.v3.text-match+json',
					},
				});

				return response.data.items.map(
					(item: GitHubCodeSearchResultItem) => {
						// Extract better snippet from text matches
						let snippet = `No snippet available for ${item.path}`;
						if (item.text_matches && item.text_matches.length > 0) {
							// Combine multiple fragments for better context
							const fragments = item.text_matches
								.map((match) => match.fragment)
								.filter(Boolean);
							if (fragments.length > 0) {
								snippet = fragments.slice(0, 2).join(' ... ');
							}
						}

						return {
							title: `${item.repository.full_name}/${item.path}`,
							url: item.html_url,
							snippet,
							score: item.score,
							source_provider: this.name,
							// Add metadata for better context
							metadata: {
								repository: item.repository.full_name,
								file_path: item.path,
								file_name: item.name,
								search_type: 'code',
							},
						};
					},
				);
			} catch (error: any) {
				return this.handle_search_error(error);
			}
		};

		return retry_with_backoff(search_request);
	}

	// Dedicated repository search method with enhanced metadata
	async search_repositories(
		params: BaseSearchParams & {
			sort?: 'stars' | 'forks' | 'updated';
		},
	): Promise<SearchResult[]> {
		const api_key = validate_api_key(
			config.search.github.api_key,
			this.name,
		);
		const octokit = new Octokit({ auth: api_key });

		const search_request = async () => {
			try {
				const response = await octokit.rest.search.repos({
					q: params.query,
					per_page: params.limit ?? 10,
					sort: params.sort,
				});

				return response.data.items.map(
					(item: GitHubRepositorySearchResultItem) => {
						// Create richer description
						let snippet =
							item.description ?? 'No description available.';
						if (item.language) {
							snippet += ` • Language: ${item.language}`;
						}
						snippet += ` • ⭐ ${item.stargazers_count} • 🍴 ${item.forks_count}`;

						return {
							title: item.full_name,
							url: item.html_url,
							snippet,
							score: item.score,
							source_provider: this.name,
							metadata: {
								repository: item.full_name,
								language: item.language,
								stars: item.stargazers_count,
								forks: item.forks_count,
								last_push: item.pushed_at,
								search_type: 'repository',
							},
						};
					},
				);
			} catch (error: any) {
				return this.handle_search_error(error);
			}
		};

		return retry_with_backoff(search_request);
	}

	// Alias for backward compatibility
	async repository_search(
		params: BaseSearchParams & {
			sort?: 'stars' | 'forks' | 'updated';
		},
	): Promise<SearchResult[]> {
		return this.search_repositories(params);
	}

	// User search method
	async search_users(
		params: BaseSearchParams,
	): Promise<SearchResult[]> {
		const api_key = validate_api_key(
			config.search.github.api_key,
			this.name,
		);
		const octokit = new Octokit({ auth: api_key });

		const search_request = async () => {
			try {
				const response = await octokit.rest.search.users({
					q: params.query,
					per_page: params.limit ?? 10,
				});

				return response.data.items.map((user: any) => ({
					title: user.login,
					url: user.html_url,
					snippet:
						user.bio ?? `GitHub user: ${user.login} • ${user.type}`,
					score: user.score,
					source_provider: this.name,
					metadata: {
						username: user.login,
						user_type: user.type,
						search_type: 'user',
					},
				}));
			} catch (error: any) {
				return this.handle_search_error(error);
			}
		};

		return retry_with_backoff(search_request);
	}

	// Centralized error handling
	private handle_search_error(error: any): never {
		const status = error.status || 500;
		const message = error.message || 'An unexpected error occurred.';

		switch (status) {
			case 401:
			case 403:
				throw new ProviderError(
					ErrorType.API_ERROR,
					`Invalid or unauthorized GitHub API key: ${message}`,
					this.name,
				);
			case 422:
				throw new ProviderError(
					ErrorType.INVALID_INPUT,
					`Invalid GitHub search query: ${message}`,
					this.name,
				);
			case 429:
				throw new ProviderError(
					ErrorType.RATE_LIMIT,
					`GitHub API rate limit exceeded: ${message}`,
					this.name,
				);
			default:
				throw new ProviderError(
					ErrorType.PROVIDER_ERROR,
					`GitHub API error: ${message}`,
					this.name,
					{ status },
				);
		}
	}
}

// Export the provider instance
export const github_search_provider = new GitHubSearchProvider();
