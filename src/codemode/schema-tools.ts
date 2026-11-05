import type { CodemodeTool } from '@earendil-works/pi-codemode';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { http_json } from '../common/http.js';
import snapshot from './provider-schemas.json' with { type: 'json' };
import {
	provider_connections,
	type ProviderConnection,
} from './providers.js';

export interface ProviderOperation {
	provider: string;
	source: string;
	name: string;
	description: string;
	method: string;
	path: string;
	query: string[];
	inputSchema: Record<string, unknown>;
}

export const provider_operations: readonly ProviderOperation[] =
	snapshot.operations;
const ajv = new Ajv2020({ strict: false, validateFormats: false });
const validators = new Map(
	provider_operations.map((operation) => [
		operation.name,
		ajv.compile(operation.inputSchema),
	]),
);

function request_url(
	connection: ProviderConnection,
	operation: ProviderOperation,
	args: Record<string, unknown>,
) {
	const path = operation.path.replace(
		/\{([^}]+)\}/g,
		(_, name: string) => {
			const value = args[name];
			if (
				typeof value !== 'string' ||
				!value ||
				value === '.' ||
				value === '..'
			)
				throw new Error('Invalid path parameter');
			return encodeURIComponent(value);
		},
	);
	const url = new URL(
		`${connection.base_url.replace(/\/$/, '')}${path}`,
	);
	for (const name of operation.query) {
		const value = args[name];
		if (value !== undefined && value !== null) {
			if (
				typeof value !== 'string' &&
				typeof value !== 'number' &&
				typeof value !== 'boolean'
			) {
				throw new Error(`Unsupported query parameter: ${name}`);
			}
			url.searchParams.set(name, String(value));
		}
	}
	return url.toString();
}

/** Generate native provider functions from the checked-in request schemas. */
export function create_provider_tools(
	connections: Record<
		string,
		ProviderConnection
	> = provider_connections(),
): CodemodeTool[] {
	return provider_operations
		.filter((operation) =>
			connections[operation.provider]?.api_key?.trim(),
		)
		.map((operation): CodemodeTool => {
			const connection = connections[operation.provider];
			const validate = validators.get(operation.name)!;
			return {
				name: operation.name,
				description: operation.description,
				inputSchema: operation.inputSchema,
				execute: async (input, { signal }) => {
					if (!validate(input)) {
						throw new Error(
							`Invalid ${operation.name} arguments: ${ajv.errorsText(validate.errors)}`,
						);
					}
					const args = input as Record<string, unknown>;
					// Streaming is not part of this JSON request/response transport.
					if (args.stream === true)
						throw new Error(
							'Streaming is not supported; set stream to false',
						);
					const headers: Record<string, string> = {
						Accept: 'application/json',
						[connection.header ?? 'Authorization']:
							`${connection.prefix ?? 'Bearer '}${connection.api_key}`,
					};
					if (operation.method === 'POST')
						headers['Content-Type'] = 'application/json';
					if (operation.provider === 'github')
						headers['User-Agent'] = 'mcp-omnisearch';
					signal.throwIfAborted();
					return http_json(
						operation.provider,
						request_url(connection, operation, args),
						{
							method: operation.method,
							headers,
							body:
								operation.method === 'POST'
									? JSON.stringify(args)
									: undefined,
							redirect: 'error',
							signal: AbortSignal.any([
								signal,
								AbortSignal.timeout(connection.timeout),
							]),
						},
					);
				},
			};
		});
}
