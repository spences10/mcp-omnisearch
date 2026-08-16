export const MCP_BACKENDS_ENV = 'OMNISEARCH_MCP_BACKENDS';

export const DEFAULT_RESERVED_MCP_BACKEND_IDS = [
	'tavily',
	'brave',
	'kagi',
	'exa',
	'kagi_enrichment',
] as const;

const PROVIDER_ID = /^[a-z][a-z0-9_-]*$/;
const ENV_REFERENCE = /^\$[A-Za-z_][A-Za-z0-9_]*$/;
const ALLOWED_BACKEND_KEYS = new Set([
	'transport',
	'command',
	'args',
	'env',
	'tool',
	'query_argument',
	'limit_argument',
	'static_arguments',
	'result_path',
	'field_aliases',
	'timeout',
	'estimated_cost',
]);
const CANONICAL_RESULT_FIELDS = [
	'title',
	'url',
	'snippet',
	'score',
] as const;
const DEFAULT_FIELD_ALIASES: Record<
	(typeof CANONICAL_RESULT_FIELDS)[number],
	string[]
> = {
	title: ['title', 'name'],
	url: ['url', 'link'],
	snippet: ['snippet', 'description', 'text', 'content'],
	score: ['score', 'relevance', 'confidence'],
};
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TIMEOUT_MS = 300_000;

export class McpBackendConfigError extends Error {
	constructor(message: string) {
		super(`${MCP_BACKENDS_ENV}: ${message}`);
		this.name = 'McpBackendConfigError';
	}
}

export type McpBackendKind = 'http' | 'stdio';

export interface ResolvedMcpBackend {
	id: string;
	kind: McpBackendKind;
	transport_url?: string;
	headers: Record<string, string>;
	command?: string[];
	env: Record<string, string>;
	tool: string;
	query_argument: string;
	limit_argument: string | null;
	static_arguments: Record<string, unknown>;
	result_path: Array<string | number>;
	field_aliases: {
		title: string[];
		url: string[];
		snippet: string[];
		score: string[];
	};
	timeout: number;
	estimated_cost: number;
}

const is_record = (
	value: unknown,
): value is Record<string, unknown> =>
	typeof value === 'object' &&
	value !== null &&
	!Array.isArray(value);

const fail = (message: string): never => {
	throw new McpBackendConfigError(message);
};

const require_trimmed_name = (
	value: unknown,
	label: string,
): string => {
	if (typeof value !== 'string') {
		return fail(`${label} must be a nonblank trimmed string`);
	}
	if (value !== value.trim() || value.length === 0) {
		return fail(`${label} must be a nonblank trimmed string`);
	}
	return value;
};

export const resolve_env_references = (
	value: unknown,
	env: NodeJS.ProcessEnv,
	label: string,
): unknown => {
	if (typeof value === 'string' && ENV_REFERENCE.test(value)) {
		const name = value.slice(1);
		const resolved = env[name];
		if (resolved === undefined) {
			return fail(
				`missing environment variable ${name} referenced by ${label}`,
			);
		}
		return resolved;
	}
	if (Array.isArray(value)) {
		return value.map((item, index) =>
			resolve_env_references(item, env, `${label}[${index}]`),
		);
	}
	if (is_record(value)) {
		return Object.fromEntries(
			Object.entries(value).map(([key, item]) => [
				key,
				resolve_env_references(item, env, `${label}.${key}`),
			]),
		);
	}
	return value;
};

export const parse_result_path = (
	value: unknown,
	label: string,
): Array<string | number> => {
	if (value === undefined) return ['results'];
	if (Array.isArray(value)) {
		if (
			value.some(
				(segment) =>
					!(
						(typeof segment === 'string' &&
							segment === segment.trim() &&
							segment.length > 0) ||
						(typeof segment === 'number' &&
							Number.isInteger(segment) &&
							segment >= 0)
					),
			)
		) {
			return fail(
				`${label} must contain nonblank trimmed strings or non-negative integers`,
			);
		}
		return value as Array<string | number>;
	}
	if (typeof value !== 'string') {
		return fail(
			`${label} must be a trimmed dotted path or an array of segments`,
		);
	}
	if (value !== value.trim() || value.length === 0) {
		return fail(`${label} must not be empty`);
	}
	return value
		.split('.')
		.map((segment) =>
			/^\d+$/.test(segment) ? Number(segment) : segment,
		);
};

const parse_field_aliases = (
	value: unknown,
	label: string,
): ResolvedMcpBackend['field_aliases'] => {
	if (value === undefined) {
		return {
			title: [...DEFAULT_FIELD_ALIASES.title],
			url: [...DEFAULT_FIELD_ALIASES.url],
			snippet: [...DEFAULT_FIELD_ALIASES.snippet],
			score: [...DEFAULT_FIELD_ALIASES.score],
		};
	}
	if (!is_record(value)) {
		return fail(`${label} must be an object`);
	}
	const unknown_fields = Object.keys(value).filter(
		(key) =>
			!CANONICAL_RESULT_FIELDS.includes(
				key as (typeof CANONICAL_RESULT_FIELDS)[number],
			),
	);
	if (unknown_fields.length > 0) {
		return fail(
			`${label} has unknown fields: ${unknown_fields.sort().join(', ')}`,
		);
	}

	const read_aliases = (
		field: (typeof CANONICAL_RESULT_FIELDS)[number],
	): string[] => {
		const raw = value[field];
		if (raw === undefined) {
			return [...DEFAULT_FIELD_ALIASES[field]];
		}
		const aliases = typeof raw === 'string' ? [raw] : raw;
		if (
			!Array.isArray(aliases) ||
			aliases.length === 0 ||
			aliases.some(
				(alias) =>
					typeof alias !== 'string' ||
					alias !== alias.trim() ||
					alias.length === 0,
			)
		) {
			return fail(
				`${label}.${field} must be a nonblank trimmed string or a non-empty list of them`,
			);
		}
		return Array.from(new Set(aliases as string[]));
	};

	return {
		title: read_aliases('title'),
		url: read_aliases('url'),
		snippet: read_aliases('snippet'),
		score: read_aliases('score'),
	};
};

const parse_timeout = (value: unknown, label: string): number => {
	if (value === undefined) return DEFAULT_TIMEOUT_MS;
	if (
		typeof value !== 'number' ||
		!Number.isFinite(value) ||
		value <= 0 ||
		value > MAX_TIMEOUT_MS
	) {
		return fail(
			`${label} must be a finite number of milliseconds between 1 and ${MAX_TIMEOUT_MS}`,
		);
	}
	return value;
};

const parse_estimated_cost = (
	value: unknown,
	label: string,
): number => {
	if (value === undefined) return 0;
	if (
		typeof value !== 'number' ||
		!Number.isFinite(value) ||
		value < 0
	) {
		return fail(
			`${label} must be a finite number greater than or equal to 0`,
		);
	}
	return value;
};

const parse_http_url = (value: unknown, label: string): string => {
	const url = require_trimmed_name(value, label);
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return fail(`${label} must be an absolute http(s) URL`);
	}
	if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
		return fail(`${label} must be an absolute http(s) URL`);
	}
	return url;
};

const parse_string_record = (
	value: unknown,
	label: string,
): Record<string, string> => {
	if (value === undefined) return {};
	if (!is_record(value)) return fail(`${label} must be an object`);
	const entries = Object.entries(value);
	for (const [key, item] of entries) {
		if (typeof item !== 'string') {
			return fail(`${label}.${key} must be a string`);
		}
	}
	return value as Record<string, string>;
};

const parse_backend = (
	id: string,
	value: unknown,
	env: NodeJS.ProcessEnv,
	reserved_ids: ReadonlySet<string>,
): ResolvedMcpBackend => {
	if (!PROVIDER_ID.test(id)) {
		return fail(
			`provider id ${JSON.stringify(id)} must match ${PROVIDER_ID}`,
		);
	}
	if (reserved_ids.has(id)) {
		return fail(
			`provider id ${JSON.stringify(id)} collides with a built-in HTTP adapter`,
		);
	}
	if (!is_record(value)) {
		return fail(`${id} must be an object`);
	}
	const unknown_keys = Object.keys(value).filter(
		(key) => !ALLOWED_BACKEND_KEYS.has(key),
	);
	if (unknown_keys.length > 0) {
		return fail(
			`${id} has unknown fields: ${unknown_keys.sort().join(', ')}`,
		);
	}

	const has_transport = value.transport !== undefined;
	const has_command = value.command !== undefined;
	if (has_transport === has_command) {
		return fail(`${id} requires exactly one of transport or command`);
	}
	if (value.env !== undefined && !has_command) {
		return fail(
			`${id}.env is only valid with command; put remote headers on transport`,
		);
	}
	if (value.args !== undefined && typeof value.command !== 'string') {
		return fail(`${id}.args is only valid when command is a string`);
	}

	const tool = require_trimmed_name(value.tool, `${id}.tool`);
	const query_argument = require_trimmed_name(
		value.query_argument ?? 'query',
		`${id}.query_argument`,
	);
	let limit_argument: string | null = 'limit';
	if (value.limit_argument === null) {
		limit_argument = null;
	} else if (value.limit_argument !== undefined) {
		limit_argument = require_trimmed_name(
			value.limit_argument,
			`${id}.limit_argument`,
		);
	}
	if (limit_argument === query_argument) {
		return fail(
			`${id} query_argument and limit_argument must be unique`,
		);
	}

	if (
		value.static_arguments !== undefined &&
		!is_record(value.static_arguments)
	) {
		return fail(`${id}.static_arguments must be an object`);
	}
	const static_arguments = (value.static_arguments ?? {}) as Record<
		string,
		unknown
	>;
	const shadowed = [query_argument, limit_argument].filter(
		(argument): argument is string =>
			argument !== null && argument in static_arguments,
	);
	if (shadowed.length > 0) {
		return fail(
			`${id}.static_arguments must not shadow ${shadowed.join(', ')}`,
		);
	}

	const result_path = parse_result_path(
		value.result_path,
		`${id}.result_path`,
	);
	const field_aliases = parse_field_aliases(
		value.field_aliases,
		`${id}.field_aliases`,
	);
	const timeout = parse_timeout(value.timeout, `${id}.timeout`);
	const estimated_cost = parse_estimated_cost(
		value.estimated_cost,
		`${id}.estimated_cost`,
	);

	if (has_transport) {
		const transport = value.transport;
		let transport_url: string;
		let headers: Record<string, string> = {};
		if (typeof transport === 'string') {
			transport_url = parse_http_url(transport, `${id}.transport`);
		} else if (is_record(transport)) {
			const unknown_transport_keys = Object.keys(transport).filter(
				(key) => key !== 'url' && key !== 'headers',
			);
			if (unknown_transport_keys.length > 0) {
				return fail(
					`${id}.transport has unknown fields: ${unknown_transport_keys.sort().join(', ')}`,
				);
			}
			transport_url = parse_http_url(
				transport.url,
				`${id}.transport.url`,
			);
			headers = parse_string_record(
				transport.headers,
				`${id}.transport.headers`,
			);
		} else {
			return fail(
				`${id}.transport must be a URL string or { url, headers }`,
			);
		}

		const resolved_url = resolve_env_references(
			transport_url,
			env,
			`${id}.transport`,
		);
		const resolved_headers = resolve_env_references(
			headers,
			env,
			`${id}.transport.headers`,
		) as Record<string, string>;

		return {
			id,
			kind: 'http',
			transport_url: parse_http_url(resolved_url, `${id}.transport`),
			headers: resolved_headers,
			env: {},
			tool,
			query_argument,
			limit_argument,
			static_arguments: resolve_env_references(
				static_arguments,
				env,
				`${id}.static_arguments`,
			) as Record<string, unknown>,
			result_path,
			field_aliases,
			timeout,
			estimated_cost,
		};
	}

	const command_value = value.command;
	let command: string[];
	if (typeof command_value === 'string') {
		const executable = require_trimmed_name(
			command_value,
			`${id}.command`,
		);
		const args =
			value.args === undefined
				? []
				: Array.isArray(value.args) &&
					  value.args.every(
							(arg) => typeof arg === 'string' && arg === arg.trim(),
					  )
					? (value.args as string[])
					: fail(`${id}.args must be an array of trimmed strings`);
		command = [executable, ...args];
	} else if (
		Array.isArray(command_value) &&
		command_value.length > 0 &&
		command_value.every(
			(part) => typeof part === 'string' && part === part.trim(),
		) &&
		command_value[0]!.length > 0
	) {
		command = command_value as string[];
	} else {
		return fail(
			`${id}.command must be a trimmed executable or a non-empty argv array`,
		);
	}

	const resolved_command = resolve_env_references(
		command,
		env,
		`${id}.command`,
	) as string[];
	if (
		resolved_command.length === 0 ||
		typeof resolved_command[0] !== 'string' ||
		resolved_command[0].trim() !== resolved_command[0] ||
		resolved_command[0].length === 0
	) {
		return fail(`${id}.command must resolve to a trimmed executable`);
	}

	const env_map = parse_string_record(value.env, `${id}.env`);

	return {
		id,
		kind: 'stdio',
		command: resolved_command,
		headers: {},
		env: resolve_env_references(env_map, env, `${id}.env`) as Record<
			string,
			string
		>,
		tool,
		query_argument,
		limit_argument,
		static_arguments: resolve_env_references(
			static_arguments,
			env,
			`${id}.static_arguments`,
		) as Record<string, unknown>,
		result_path,
		field_aliases,
		timeout,
		estimated_cost,
	};
};

export const load_mcp_backends = (
	env: NodeJS.ProcessEnv = process.env,
	reserved_ids: readonly string[] = DEFAULT_RESERVED_MCP_BACKEND_IDS,
): ResolvedMcpBackend[] => {
	const raw = env[MCP_BACKENDS_ENV];
	if (raw === undefined || raw.trim() === '') return [];

	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return fail('must be valid JSON');
	}
	if (!is_record(parsed)) {
		return fail('must be a JSON object keyed by provider id');
	}

	const reserved = new Set(reserved_ids);
	return Object.entries(parsed).map(([id, backend]) =>
		parse_backend(id, backend, env, reserved),
	);
};
