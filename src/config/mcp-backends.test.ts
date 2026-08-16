import { describe, expect, it } from 'vitest';
import { web_search_provider_definitions } from '../server/provider-definitions.js';
import {
	DEFAULT_RESERVED_MCP_BACKEND_IDS,
	McpBackendConfigError,
	load_mcp_backends,
	parse_result_path,
	resolve_env_references,
} from './mcp-backends.js';

const valid_exa_backend = {
	transport: {
		url: 'https://mcp.exa.ai/mcp',
		headers: { 'x-api-key': '$EXA_API_KEY' },
	},
	tool: 'web_search_exa',
	query_argument: 'query',
	limit_argument: 'numResults',
	result_path: ['results'],
	field_aliases: {
		title: ['title'],
		url: ['url'],
		snippet: ['text', 'snippet'],
		score: ['score'],
	},
	timeout: 30_000,
	estimated_cost: 0,
};

const load = (
	backends: unknown,
	env: NodeJS.ProcessEnv = { EXA_API_KEY: 'exa-key' },
) =>
	load_mcp_backends({
		...env,
		OMNISEARCH_MCP_BACKENDS: JSON.stringify(backends),
	});

describe('load_mcp_backends', () => {
	it('keeps reserved ids aligned with built-in HTTP search adapters', () => {
		expect([...DEFAULT_RESERVED_MCP_BACKEND_IDS]).toEqual(
			web_search_provider_definitions.map(
				(definition) => definition.id,
			),
		);
	});

	it('returns no backends when the env var is unset or blank', () => {
		expect(load_mcp_backends({})).toEqual([]);
		expect(
			load_mcp_backends({ OMNISEARCH_MCP_BACKENDS: '   ' }),
		).toEqual([]);
	});

	it('loads the official Exa remote mapping', () => {
		expect(load({ exa_mcp: valid_exa_backend })).toEqual([
			{
				id: 'exa_mcp',
				kind: 'http',
				transport_url: 'https://mcp.exa.ai/mcp',
				headers: { 'x-api-key': 'exa-key' },
				env: {},
				tool: 'web_search_exa',
				query_argument: 'query',
				limit_argument: 'numResults',
				static_arguments: {},
				result_path: ['results'],
				field_aliases: {
					title: ['title'],
					url: ['url'],
					snippet: ['text', 'snippet'],
					score: ['score'],
				},
				timeout: 30_000,
				estimated_cost: 0,
			},
		]);
	});

	it('loads a stdio command backend and resolves exact $ENV values', () => {
		expect(
			load(
				{
					local_search: {
						command: 'npx',
						args: ['-y', 'search-mcp'],
						env: { API_KEY: '$SEARCH_API_KEY' },
						tool: 'search',
					},
				},
				{ SEARCH_API_KEY: 'secret' },
			),
		).toEqual([
			expect.objectContaining({
				id: 'local_search',
				kind: 'stdio',
				command: ['npx', '-y', 'search-mcp'],
				env: { API_KEY: 'secret' },
				query_argument: 'query',
				limit_argument: 'limit',
				result_path: ['results'],
			}),
		]);
	});

	it('does not interpolate $NAME inside a larger string', () => {
		expect(
			resolve_env_references(
				'Bearer $EXA_API_KEY',
				{ EXA_API_KEY: 'exa-key' },
				'header',
			),
		).toBe('Bearer $EXA_API_KEY');
	});

	it('fails closed on invalid JSON, reserved ids, and unknown fields', () => {
		expect(() =>
			load_mcp_backends({ OMNISEARCH_MCP_BACKENDS: '{' }),
		).toThrow(McpBackendConfigError);
		expect(() => load({ exa: valid_exa_backend })).toThrow(
			/collides with a built-in HTTP adapter/,
		);
		expect(() =>
			load({
				exa_mcp: { ...valid_exa_backend, weight: 1 },
			}),
		).toThrow(/unknown fields: weight/);
	});

	it('requires exactly one of transport or command', () => {
		expect(() =>
			load({
				broken: { tool: 'search' },
			}),
		).toThrow(/exactly one of transport or command/);
		expect(() =>
			load({
				broken: {
					transport: 'https://mcp.exa.ai/mcp',
					command: ['npx'],
					tool: 'search',
				},
			}),
		).toThrow(/exactly one of transport or command/);
	});

	it('rejects env on HTTP transports and missing $ENV references', () => {
		expect(() =>
			load({
				exa_mcp: {
					...valid_exa_backend,
					env: { API_KEY: '$EXA_API_KEY' },
				},
			}),
		).toThrow(/env is only valid with command/);
		expect(() => load({ exa_mcp: valid_exa_backend }, {})).toThrow(
			/missing environment variable EXA_API_KEY/,
		);
	});

	it('rejects blank mappings and colliding argument names', () => {
		expect(() =>
			load({
				exa_mcp: { ...valid_exa_backend, tool: ' search' },
			}),
		).toThrow(/tool must be a nonblank trimmed string/);
		expect(() =>
			load({
				exa_mcp: {
					...valid_exa_backend,
					query_argument: 'q',
					limit_argument: 'q',
				},
			}),
		).toThrow(/must be unique/);
		expect(() =>
			load({
				exa_mcp: {
					...valid_exa_backend,
					field_aliases: { heading: ['title'] },
				},
			}),
		).toThrow(/unknown fields: heading/);
	});

	it('accepts a transport URL string and a command argv array', () => {
		expect(
			load({
				remote: {
					transport: 'https://mcp.exa.ai/mcp',
					tool: 'web_search_exa',
					limit_argument: null,
				},
			}),
		).toEqual([
			expect.objectContaining({
				id: 'remote',
				kind: 'http',
				transport_url: 'https://mcp.exa.ai/mcp',
				limit_argument: null,
			}),
		]);
		expect(
			load({
				local_search: {
					command: ['npx', '-y', 'search-mcp'],
					tool: 'search',
				},
			}),
		).toEqual([
			expect.objectContaining({
				kind: 'stdio',
				command: ['npx', '-y', 'search-mcp'],
			}),
		]);
	});

	it('rejects invalid URLs, ids, and timeout values', () => {
		expect(() =>
			load({
				'Bad Id': {
					transport: 'https://mcp.exa.ai/mcp',
					tool: 'search',
				},
			}),
		).toThrow(/must match/);
		expect(() =>
			load({
				remote: {
					transport: 'ftp://example.com/mcp',
					tool: 'search',
				},
			}),
		).toThrow(/absolute http\(s\) URL/);
		expect(() =>
			load({
				remote: {
					transport: 'https://mcp.exa.ai/mcp',
					tool: 'search',
					timeout: 0,
				},
			}),
		).toThrow(/milliseconds/);
	});

	it('parses dotted result paths and integer segments', () => {
		expect(parse_result_path('payload.items', 'path')).toEqual([
			'payload',
			'items',
		]);
		expect(parse_result_path('payload.0.items', 'path')).toEqual([
			'payload',
			0,
			'items',
		]);
		expect(parse_result_path([], 'path')).toEqual([]);
		expect(() => parse_result_path('', 'path')).toThrow(
			/must not be empty/,
		);
	});
});
