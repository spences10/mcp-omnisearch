import { McpServer } from 'tmcp';
import type { GenericSchema } from 'valibot';
import * as v from 'valibot';
import { SearchProvider } from '../../common/types.js';
import { config } from '../../config/env.js';
import { ProviderRegistry } from '../provider-registry.js';
import { handle_tool_result } from './responses.js';
import {
	large_result_mode_schema,
	limit_schema,
	query_schema,
} from './schemas.js';

// Concrete provider imports
import { ExaAnswerProvider } from '../../providers/ai-response/exa-answer/index.js';
import { KagiFastGPTProvider } from '../../providers/ai-response/kagi-fastgpt/index.js';
import { LinkupProvider } from '../../providers/ai-response/linkup/index.js';

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
		api_key_name: 'KAGI_API_KEY',
		tools: ['ai_search'],
		capabilities: ['answer_generation', 'citations'],
		api_key: config.ai_response.kagi_fastgpt.api_key,
		create: () => new KagiFastGPTProvider(),
	});
	providers.register({
		id: 'exa_answer',
		name: 'exa_answer',
		category: 'ai_response',
		api_key_name: 'EXA_API_KEY',
		tools: ['ai_search'],
		capabilities: ['answer_generation', 'semantic_search'],
		api_key: config.ai_response.exa_answer.api_key,
		create: () => new ExaAnswerProvider(),
	});
	providers.register({
		id: 'linkup',
		name: 'linkup',
		category: 'ai_response',
		api_key_name: 'LINKUP_API_KEY',
		tools: ['ai_search'],
		capabilities: ['answer_generation', 'citations'],
		api_key: config.ai_response.linkup.api_key,
		create: () => new LinkupProvider(),
	});

	return providers.size > 0;
};

export const get_available_providers = () => providers.names();

export const get_provider_status_entries = () =>
	providers.status_entries();

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
				query: query_schema,
				provider: v.pipe(
					v.picklist(provider_names),
					v.description('AI search provider to use'),
				),
				limit: limit_schema,
				large_result_mode: large_result_mode_schema,
			}),
		},
		async ({ query, provider, limit, large_result_mode }) =>
			handle_tool_result(
				'ai_search',
				async () => {
					const selected = providers.require(provider, 'ai_search');

					return selected.search({
						query,
						limit,
					});
				},
				{ large_result_mode },
			),
	);
};
