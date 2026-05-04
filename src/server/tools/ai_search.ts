import { McpServer } from 'tmcp';
import type { GenericSchema } from 'valibot';
import * as v from 'valibot';
import { SearchProvider } from '../../common/types.js';
import { config } from '../../config/env.js';
import { ProviderRegistry } from '../provider-registry.js';
import { handle_tool_result } from './responses.js';

// Concrete provider imports
import { ExaAnswerProvider } from '../../providers/ai_response/exa_answer/index.js';
import { KagiFastGPTProvider } from '../../providers/ai_response/kagi_fastgpt/index.js';
import { LinkupProvider } from '../../providers/ai_response/linkup/index.js';

export type AISearchProviderName =
	| 'kagi_fastgpt'
	| 'exa_answer'
	| 'linkup';

const providers = new ProviderRegistry<SearchProvider>();

export const initialize_ai_search = (): boolean => {
	providers.clear();
	providers.register({
		id: 'kagi_fastgpt',
		name: 'kagi_fastgpt',
		category: 'ai_response',
		api_key: config.ai_response.kagi_fastgpt.api_key,
		create: () => new KagiFastGPTProvider(),
	});
	providers.register({
		id: 'exa_answer',
		name: 'exa_answer',
		category: 'ai_response',
		api_key: config.ai_response.exa_answer.api_key,
		create: () => new ExaAnswerProvider(),
	});
	providers.register({
		id: 'linkup',
		name: 'linkup',
		category: 'ai_response',
		api_key: config.ai_response.linkup.api_key,
		create: () => new LinkupProvider(),
	});

	return providers.size > 0;
};

export const get_available_providers = () => providers.names();

export const register_ai_search = (
	server: McpServer<GenericSchema>,
) => {
	if (providers.size === 0) return;

	const provider_names = providers.ids() as AISearchProviderName[];

	server.tool(
		{
			name: 'ai_search',
			description:
				'Get AI-powered answers with citations and reasoning. Use when you need synthesized answers rather than raw search results. Providers: kagi_fastgpt (fast ~900ms answers), exa_answer (semantic AI), linkup (deep agentic search with sources).',
			annotations: {
				readOnlyHint: true,
				destructiveHint: false,
				idempotentHint: true,
				openWorldHint: true,
			},
			schema: v.object({
				query: v.pipe(
					v.string(),
					v.description('Question or search query'),
				),
				provider: v.pipe(
					v.picklist(provider_names),
					v.description('AI search provider to use'),
				),
				limit: v.optional(
					v.pipe(
						v.number(),
						v.description('Maximum number of results (default: 10)'),
					),
				),
			}),
		},
		async ({ query, provider, limit }) =>
			handle_tool_result('ai_search', async () => {
				const selected = providers.require(provider, 'ai_search');

				return selected.search({
					query,
					limit,
				});
			}),
	);
};
