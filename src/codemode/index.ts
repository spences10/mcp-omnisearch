import {
	CodemodeSandbox,
	renderToolSignature,
	type CodemodeTool,
} from '@earendil-works/pi-codemode';
import type { McpServer } from 'tmcp';
import * as v from 'valibot';
import { handle_large_result } from '../common/results.js';
import { large_result_mode_schema } from '../server/tools/schemas.js';
import { provider_connections } from './providers.js';
import {
	create_provider_tools,
	provider_operations,
} from './schema-tools.js';

// Remove prose from the discovery copy, not the schemas used for validation.
// Schema dictionaries need special handling to retain fields named description.
function compact_discovery_schema(value: unknown): unknown {
	if (Array.isArray(value))
		return value.map(compact_discovery_schema);
	if (!value || typeof value !== 'object') return value;
	return Object.fromEntries(
		Object.entries(value)
			.filter(([key]) => key !== 'description')
			.map(([key, child]) => {
				// These values are literal data, not schema nodes.
				if (['enum', 'const', 'default'].includes(key))
					return [key, child];
				if (
					[
						'properties',
						'patternProperties',
						'$defs',
						'definitions',
						'dependentSchemas',
					].includes(key)
				) {
					return [
						key,
						Object.fromEntries(
							Object.entries(child as Record<string, unknown>).map(
								([name, schema]) => [
									name,
									compact_discovery_schema(schema),
								],
							),
						),
					];
				}
				return [key, compact_discovery_schema(child)];
			}),
	);
}

// Pi renders composition keywords before sibling properties. Express their
// intersection explicitly so declarations retain fields such as Exa's urls.
export function provider_declaration(tool: CodemodeTool) {
	const schema = compact_discovery_schema(tool.inputSchema) as Record<
		string,
		unknown
	>;
	const { oneOf, anyOf, allOf, $defs, ...base } = schema;
	const parts: unknown[] = Array.isArray(allOf) ? [...allOf] : [];
	if (base.type || base.properties) parts.unshift(base);
	if (oneOf) parts.push({ oneOf });
	if (anyOf) parts.push({ anyOf });
	const declaration = renderToolSignature(
		{ ...tool, inputSchema: { $defs, allOf: parts } },
		{ inputMaxChars: 64_000 },
	);
	return `declare const tools: {\n${declaration}\n};`;
}

const max_calls = 20;
let active_workers = 0;

/** Host-enforced capacity, shared by all server instances in this process. */
function acquire_worker() {
	if (active_workers >= 2)
		throw new Error(
			'Code Mode is busy; retry after another execution finishes',
		);
	active_workers++;
	return () => {
		active_workers--;
	};
}

export async function execute_code(
	code: string,
	tools: CodemodeTool[],
	options: { timeout_ms?: number; signal?: AbortSignal } = {},
) {
	let calls = 0;
	const sandbox = new CodemodeSandbox({
		timeoutMs: options.timeout_ms ?? 60_000,
		memoryLimitBytes: 64 * 1024 * 1024,
		acquireWorker: acquire_worker,
		tools: tools.map((tool) => ({
			...tool,
			execute: (args, context) => {
				if (++calls > max_calls)
					throw new Error(
						`At most ${max_calls} provider calls are allowed per execution`,
					);
				return tool.execute(args, context);
			},
		})),
	});
	try {
		return await sandbox.execute(code, { signal: options.signal });
	} finally {
		await sandbox.close();
	}
}

export function register_codemode(
	server: McpServer<v.GenericSchema>,
) {
	const connections = provider_connections();
	const tools = create_provider_tools(connections);
	server.tool(
		{
			name: 'search',
			description:
				'Discover configured provider API functions for Code Mode. Omit query to list names and descriptions. Supply a function name or space-separated keywords to get matching TypeScript declarations. Call this before execute; arguments and results use native provider formats, not the consolidated tool formats.',
			annotations: {
				readOnlyHint: true,
				destructiveHint: false,
				idempotentHint: true,
				openWorldHint: false,
			},
			schema: v.object({
				query: v.optional(
					v.pipe(v.string(), v.regex(/\S/, 'Query cannot be empty')),
				),
			}),
		},
		async ({ query }) => {
			const terms =
				query?.toLowerCase().split(/\s+/).filter(Boolean) ?? [];
			const matches = tools.filter((tool) =>
				terms.every((term) =>
					`${tool.name} ${tool.description}`
						.toLowerCase()
						.includes(term),
				),
			);
			return {
				content: [
					{
						type: 'text',
						text: JSON.stringify(
							matches.map((tool) => ({
								name: tool.name,
								description: tool.description,
								...(query
									? {
											declaration: provider_declaration(tool),
										}
									: {}),
							})),
						),
					},
				],
			};
		},
	);
	server.tool(
		{
			name: 'execute',
			description:
				'Run JavaScript in an isolated Pi QuickJS sandbox. Discover native provider functions with search, then call await tools.<name>(args). Use return, text() or console.log() for output. Promise.all supports parallel requests. Only final output reaches the client. No filesystem, network, Node APIs, modules or timers. Credentials stay on the host. At most 20 provider calls; 64 MiB heap; default deadline 60 seconds. Results are raw provider JSON. Async jobs return IDs: retrieve their status in a later call. No automatic retries. Calls already made are not undone on failure. State is not persisted between executions.',
			// Some permitted requests can run browser actions or incur API charges.
			annotations: {
				readOnlyHint: false,
				destructiveHint: true,
				idempotentHint: false,
				openWorldHint: true,
			},
			schema: v.object({
				code: v.pipe(
					v.string(),
					v.regex(/\S/, 'Code cannot be empty'),
					v.maxLength(100_000),
				),
				timeout_ms: v.optional(
					v.pipe(
						v.number(),
						v.integer(),
						v.minValue(1),
						v.maxValue(180_000),
					),
				),
				large_result_mode: large_result_mode_schema,
			}),
		},
		async ({ code, timeout_ms, large_result_mode }) => {
			const result = await execute_code(code, tools, {
				timeout_ms,
				signal: server.ctx.signal,
			});
			return {
				isError: !result.ok,
				content: [
					{
						type: 'text',
						text: JSON.stringify(
							handle_large_result(result, 'codemode', {
								mode: large_result_mode,
							}),
						),
					},
				],
			};
		},
	);
	server.resource(
		{
			name: 'provider-status',
			description: 'Configured native Code Mode provider functions',
			uri: 'omnisearch://providers/status',
		},
		async () => ({
			contents: [
				{
					uri: 'omnisearch://providers/status',
					mimeType: 'application/json',
					text: JSON.stringify(
						Object.entries(connections).map(([name, connection]) => ({
							name,
							status: connection.api_key?.trim()
								? 'available'
								: 'unavailable',
							functions: provider_operations
								.filter(
									(operation) =>
										operation.provider === name &&
										tools.some(
											(tool) => tool.name === operation.name,
										),
								)
								.map((operation) => operation.name),
						})),
					),
				},
			],
		}),
	);
}
