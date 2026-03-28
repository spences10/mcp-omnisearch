import { McpServer } from 'tmcp';
import type { GenericSchema } from 'valibot';
import * as v from 'valibot';
import { create_error_response } from '../../common/errors.js';
import { handle_large_result } from '../../common/results.js';
import { is_api_key_valid } from '../../common/validation.js';
import { config } from '../../config/env.js';
import { GitHubSearchProvider } from '../../providers/search/github/index.js';

let provider: GitHubSearchProvider | undefined;

export const initialize_github_search = (): boolean => {
	if (is_api_key_valid(config.search.github.api_key, 'github')) {
		provider = new GitHubSearchProvider();
		return true;
	}
	return false;
};

export const get_available = () => (provider ? ['github'] : []);

export const register_github_search = (
	server: McpServer<GenericSchema>,
) => {
	if (!provider) return;

	server.tool(
		{
			name: 'github_search',
			description:
				'Search GitHub for code, repositories, or users. Use when you need to find code examples, open source projects, or developers. Supports advanced syntax: filename:, path:, repo:, user:, language:, in:file.',
			annotations: {
				readOnlyHint: true,
				destructiveHint: false,
				idempotentHint: true,
				openWorldHint: true,
			},
			schema: v.object({
				query: v.pipe(v.string(), v.description('Search query')),
				search_type: v.optional(
					v.pipe(
						v.picklist(['code', 'repositories', 'users']),
						v.description('What to search for (default: code)'),
					),
				),
				limit: v.optional(
					v.pipe(
						v.number(),
						v.description('Maximum number of results (default: 10)'),
					),
				),
				sort: v.optional(
					v.pipe(
						v.picklist(['stars', 'forks', 'updated']),
						v.description('Sort order (repositories only)'),
					),
				),
			}),
		},
		async ({ query, search_type = 'code', limit, sort }) => {
			try {
				let results;
				switch (search_type) {
					case 'code':
						results = await provider!.search_code({
							query,
							limit,
						});
						break;
					case 'repositories':
						results = await provider!.search_repositories({
							query,
							limit,
							sort,
						} as any);
						break;
					case 'users':
						results = await provider!.search_users({
							query,
							limit,
						});
						break;
				}
				const safe_results = handle_large_result(
					results,
					'github_search',
				);
				return {
					content: [
						{
							type: 'text' as const,
							text: JSON.stringify(safe_results, null, 2),
						},
					],
				};
			} catch (error) {
				const error_response = create_error_response(error as Error);
				return {
					content: [
						{
							type: 'text' as const,
							text: error_response.error,
						},
					],
					isError: true,
				};
			}
		},
	);
};
