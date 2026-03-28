import { McpServer } from 'tmcp';
import type { GenericSchema } from 'valibot';
import * as v from 'valibot';
import { create_error_response } from '../../common/errors.js';
import { handle_large_result } from '../../common/results.js';
import {
	ErrorType,
	ProviderError,
	SearchProvider,
} from '../../common/types.js';
import { is_api_key_valid } from '../../common/validation.js';
import { config } from '../../config/env.js';

// Concrete provider imports
import { ExaAnswerProvider } from '../../providers/ai_response/exa_answer/index.js';
import { KagiFastGPTProvider } from '../../providers/ai_response/kagi_fastgpt/index.js';
import { LinkupProvider } from '../../providers/ai_response/linkup/index.js';

export type AISearchProviderName =
	| 'kagi_fastgpt'
	| 'exa_answer'
	| 'linkup';

const providers = new Map<string, SearchProvider>();

export const initialize_ai_search = (): boolean => {
	if (
		is_api_key_valid(
			config.ai_response.kagi_fastgpt.api_key,
			'kagi_fastgpt',
		)
	)
		providers.set('kagi_fastgpt', new KagiFastGPTProvider());
	if (
		is_api_key_valid(
			config.ai_response.exa_answer.api_key,
			'exa_answer',
		)
	)
		providers.set('exa_answer', new ExaAnswerProvider());
	if (is_api_key_valid(config.ai_response.linkup.api_key, 'linkup'))
		providers.set('linkup', new LinkupProvider());

	return providers.size > 0;
};

export const get_available_providers = () =>
	Array.from(providers.keys());

export const register_ai_search = (
	server: McpServer<GenericSchema>,
) => {
	if (providers.size === 0) return;

	const provider_names = Array.from(
		providers.keys(),
	) as AISearchProviderName[];

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
		async ({ query, provider, limit }) => {
			try {
				const selected = providers.get(provider);
				if (!selected) {
					throw new ProviderError(
						ErrorType.INVALID_INPUT,
						`Provider "${provider}" is not available. Available: ${Array.from(providers.keys()).join(', ')}`,
						'ai_search',
					);
				}

				const results = await selected.search({
					query,
					limit,
				});
				const safe_results = handle_large_result(
					results,
					'ai_search',
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
