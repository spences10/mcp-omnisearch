import { Octokit } from 'octokit';
import { AbstractSearchProvider } from '../../../common/abstract-search-provider.js';
import {
	BaseSearchParams,
	SearchResult,
} from '../../../common/types.js';
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
		object_url: string;
		object_type: string;
		property: string;
		fragment: string;
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

export class GitHubSearchProvider extends AbstractSearchProvider {
	readonly name = 'github';
	readonly description =
		'Search for code on GitHub. This is ideal for finding code examples, tracking down function definitions, or locating files with specific names or paths. Supports advanced query syntax with qualifiers like `filename:`, `path:`, `repo:`, `user:`, `language:`, and `in:file`. For example, to find a file named `settings.json` in a `.claude` directory, you could use the query: `filename:settings.json path:.claude`';

	private octokit: Octokit;

	constructor() {
		super(
			{
				api_key: config.search.github.api_key || '',
				base_url:
					config.search.github.base_url || 'https://api.github.com',
				timeout: config.search.github.timeout,
				auth_type: 'bearer',
			},
			'github',
		);

		this.octokit = new Octokit({ auth: this.config.api_key });
	}

	// Main search method for code search (default behavior)
	async search(params: BaseSearchParams): Promise<SearchResult[]> {
		return this.search_code(params);
	}

	// Dedicated code search method with enhanced snippets
	async search_code(
		params: BaseSearchParams & { include_snippets?: boolean },
	): Promise<SearchResult[]> {
		// Validate input parameters
		this.validate_search_params(params);

		const search_request = async () => {
			// Enable text matches to get better snippets
			const response = await this.octokit.rest.search.code({
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
		};

		return this.execute_with_retry(search_request);
	}

	// Dedicated repository search method with enhanced metadata
	async search_repositories(
		params: BaseSearchParams & {
			sort?: 'stars' | 'forks' | 'updated';
		},
	): Promise<SearchResult[]> {
		// Validate input parameters
		this.validate_search_params(params);

		const search_request = async () => {
			const response = await this.octokit.rest.search.repos({
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
		};

		return this.execute_with_retry(search_request);
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
		// Validate input parameters
		this.validate_search_params(params);

		const search_request = async () => {
			const response = await this.octokit.rest.search.users({
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
		};

		return this.execute_with_retry(search_request);
	}
}

// Export the provider instance
export const github_search_provider = new GitHubSearchProvider();
