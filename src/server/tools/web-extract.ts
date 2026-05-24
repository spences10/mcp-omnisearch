import { McpServer } from 'tmcp';
import type { GenericSchema } from 'valibot';
import * as v from 'valibot';
import { omit_raw_contents } from '../../common/results.js';
import {
	ErrorType,
	ProcessingProvider,
	ProviderError,
} from '../../common/types.js';
import {
	get_default_web_extract_mode,
	get_valid_web_extract_modes,
	make_processing_provider_key,
	web_extract_provider_definitions,
	type WebExtractProvider,
} from '../provider-definitions.js';
import { ProviderRegistry } from '../provider-registry.js';
import { handle_tool_result } from './responses.js';
import {
	include_raw_contents_schema,
	large_result_mode_schema,
	url_or_urls_schema,
} from './schemas.js';

const providers = new ProviderRegistry<ProcessingProvider>();

export const initialize_web_extract = (): boolean => {
	providers.clear();
	providers.register_all(web_extract_provider_definitions);

	return providers.size > 0;
};

export const get_available_providers = () => providers.names();

export const get_provider_status_entries = () =>
	providers.status_entries();

const web_extract_modes = Array.from(
	new Set(
		web_extract_provider_definitions.map(
			(definition) => definition.modes[0],
		),
	),
);

export const register_web_extract = (
	server: McpServer<GenericSchema>,
) => {
	if (providers.size === 0) return;

	const available = get_available_providers() as WebExtractProvider[];

	server.tool(
		{
			name: 'web_extract',
			description:
				'Extract, process, or summarize web content from URLs. Use when you need to read page content, summarize articles, crawl sites, or extract structured data. Providers: tavily (content extraction), kagi (summarization of pages/videos/podcasts), firecrawl (scraping/crawling/mapping/structured extraction/interactive), exa (content retrieval/similar pages).',
			annotations: {
				readOnlyHint: true,
				destructiveHint: false,
				idempotentHint: true,
				openWorldHint: true,
			},
			schema: v.object({
				url: url_or_urls_schema,
				provider: v.pipe(
					v.picklist(available),
					v.description('Processing provider to use'),
				),
				mode: v.optional(
					v.pipe(
						v.picklist(web_extract_modes),
						v.description(
							'Processing mode. Firecrawl: scrape/crawl/map/extract/actions. Exa: contents/similar. Tavily: extract. Kagi: summarize. Defaults to provider default.',
						),
					),
				),
				extract_depth: v.optional(
					v.pipe(
						v.picklist(['basic', 'advanced']),
						v.description('Extraction depth (default: basic)'),
					),
				),
				large_result_mode: large_result_mode_schema,
				include_raw_contents: include_raw_contents_schema,
			}),
		},
		async ({
			url,
			provider,
			mode,
			extract_depth,
			large_result_mode,
			include_raw_contents = true,
		}) =>
			handle_tool_result(
				'web_extract',
				async () => {
					const provider_name = provider as WebExtractProvider;
					const resolved_mode =
						mode || get_default_web_extract_mode(provider_name);
					const allowed = get_valid_web_extract_modes(provider_name);

					if (!resolved_mode || !allowed.includes(resolved_mode)) {
						throw new ProviderError(
							ErrorType.INVALID_INPUT,
							`Mode "${resolved_mode}" is not valid for provider "${provider}". Valid modes: ${allowed.join(', ')}`,
							'web_extract',
						);
					}

					const key = make_processing_provider_key(
						provider,
						resolved_mode,
					);
					const selected = providers.require(
						key,
						'web_extract',
						`Provider "${provider}" with mode "${resolved_mode}" is not available. Available modes for configured providers: ${allowed.join(', ') || 'none'}.`,
					);

					const result = await selected.process_content(
						url,
						extract_depth,
					);

					return include_raw_contents
						? result
						: omit_raw_contents(result);
				},
				{ large_result_mode },
			),
	);
};
