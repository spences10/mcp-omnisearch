import { McpServer } from 'tmcp';
import type { GenericSchema } from 'valibot';
import * as v from 'valibot';
import {
	PROVIDER_BENCH_WARNING,
	run_provider_bench,
	select_bench_providers,
	type BenchableProvider,
} from '../../bench/provider-bench.js';
import type { SearchProvider } from '../../common/types.js';
import type { RegisteredProvider } from '../provider-registry.js';
import { handle_tool_result } from './responses.js';
import { large_result_mode_schema, limit_schema } from './schemas.js';
import { get_search_provider_entries } from './web-search.js';

export const to_benchable_providers = (
	entries: readonly RegisteredProvider<SearchProvider>[],
): BenchableProvider[] =>
	entries.map((entry) => ({
		id: entry.id,
		search: (params) => entry.instance.search(params),
	}));

export const register_provider_bench = (
	server: McpServer<GenericSchema>,
) => {
	const available = to_benchable_providers(
		get_search_provider_entries(),
	);
	if (available.length === 0) return;

	const provider_names = available.map((provider) => provider.id);

	server.tool(
		{
			name: 'provider_bench',
			description: `Race configured web_search providers on a small fixed suite (docs, vendor release, community, non-English). WARNING: ${PROVIDER_BENCH_WARNING} Returns success rate, median latency, result volume, unique URLs, snippet coverage, and a recommended provider priority.`,
			annotations: {
				readOnlyHint: true,
				destructiveHint: false,
				idempotentHint: false,
				openWorldHint: true,
			},
			schema: v.object({
				providers: v.optional(
					v.pipe(
						v.array(v.picklist(provider_names)),
						v.minLength(1, 'Provide at least one provider'),
						v.description(
							'Limit the bench to these configured web_search providers',
						),
					),
				),
				limit: limit_schema,
				large_result_mode: large_result_mode_schema,
			}),
		},
		async ({ providers, limit, large_result_mode }) =>
			handle_tool_result(
				'provider_bench',
				async () =>
					run_provider_bench({
						providers: select_bench_providers(
							to_benchable_providers(get_search_provider_entries()),
							providers,
						),
						limit,
					}),
				{ large_result_mode },
			),
	);
};
