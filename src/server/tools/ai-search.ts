import { McpServer } from 'tmcp';
import type { GenericSchema } from 'valibot';
import * as v from 'valibot';
import {
	estimated_provider_cost_usd,
	plan_and_run,
} from '../../common/request-budgets.js';
import { SearchProvider } from '../../common/types.js';
import {
	ai_search_provider_definitions,
	type AISearchProviderName,
} from '../provider-definitions.js';
import { ProviderRegistry } from '../provider-registry.js';
import { handle_tool_result } from './responses.js';
import {
	large_result_mode_schema,
	limit_schema,
	query_schema,
	request_budget_schema_fields,
} from './schemas.js';

const providers = new ProviderRegistry<SearchProvider>();

export const initialize_ai_search = (): boolean => {
	providers.clear();
	providers.register_all(ai_search_provider_definitions);

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
				...request_budget_schema_fields,
			}),
		},
		async ({
			query,
			provider,
			limit,
			large_result_mode,
			max_providers,
			timeout_seconds,
			budget_usd,
		}) =>
			handle_tool_result(
				'ai_search',
				async () =>
					plan_and_run(
						'ai_search',
						[
							{
								id: provider,
								estimated_cost_usd:
									estimated_provider_cost_usd(provider),
							},
						],
						{ max_providers, timeout_seconds, budget_usd },
						async (plan) => {
							const selected = providers.require(
								plan.providers[0].id,
								'ai_search',
							);

							return selected.search({
								query,
								limit,
							});
						},
					),
				{ large_result_mode },
			),
	);
};
