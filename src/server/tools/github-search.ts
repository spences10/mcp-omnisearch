import { McpServer } from 'tmcp';
import type { GenericSchema } from 'valibot';
import * as v from 'valibot';
import { config } from '../../config/env.js';
import { GitHubSearchProvider } from '../../providers/search/github/index.js';
import { ProviderRegistry } from '../provider-registry.js';
import { handle_tool_result } from './responses.js';
import { limit_schema, query_schema } from './schemas.js';

const providers = new ProviderRegistry<GitHubSearchProvider>();

export const initialize_github_search = (): boolean => {
	providers.clear();
	providers.register({
		id: 'github',
		name: 'github',
		category: 'search',
		api_key: config.search.github.api_key,
		create: () => new GitHubSearchProvider(),
	});

	return providers.size > 0;
};

export const get_available = () => providers.names();

export const register_github_search = (
	server: McpServer<GenericSchema>,
) => {
	if (providers.size === 0) return;

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
				query: query_schema,
				search_type: v.optional(
					v.pipe(
						v.picklist(['code', 'repositories', 'users']),
						v.description('What to search for (default: code)'),
					),
				),
				limit: limit_schema,
				sort: v.optional(
					v.pipe(
						v.picklist(['stars', 'forks', 'updated']),
						v.description('Sort order (repositories only)'),
					),
				),
			}),
		},
		async ({ query, search_type = 'code', limit, sort }) =>
			handle_tool_result('github_search', async () => {
				const selected = providers.require('github', 'github_search');

				switch (search_type) {
					case 'code':
						return selected.search_code({
							query,
							limit,
						});
					case 'repositories':
						return selected.search_repositories({
							query,
							limit,
							sort,
						});
					case 'users':
						return selected.search_users({
							query,
							limit,
						});
				}
			}),
	);
};
