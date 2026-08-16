export type TransportMode = 'stdio' | 'http';

export type HttpConfig = {
	transport: TransportMode;
	host: string;
	port: number;
	path: string;
	auth_tokens: string[];
	rate_limit_requests: number;
	rate_limit_window_ms: number;
	unauth_rate_limit_requests: number;
};

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 8080;
const DEFAULT_PATH = '/mcp';
const DEFAULT_RATE_LIMIT_REQUESTS = 120;
const DEFAULT_RATE_LIMIT_WINDOW_MINUTES = 1;
const DEFAULT_UNAUTH_RATE_LIMIT_REQUESTS = 20;

const IPV4_MAPPED_PREFIX = '::ffff:';

export const parse_auth_tokens = (
	raw: string | undefined,
): string[] => {
	if (raw === undefined) return [];

	const trimmed = raw.trim();
	if (trimmed === '' || trimmed === '[]') return [];

	if (trimmed.startsWith('[')) {
		let parsed: unknown;
		try {
			parsed = JSON.parse(trimmed);
		} catch {
			throw new Error(
				'AUTH_TOKENS must be a JSON array or a comma-separated list of unique, nonblank tokens.',
			);
		}

		if (!Array.isArray(parsed)) {
			throw new Error(
				'AUTH_TOKENS JSON value must be an array of unique, nonblank tokens.',
			);
		}

		return normalize_json_tokens(parsed);
	}

	return normalize_delimited_tokens(trimmed);
};

const normalize_json_tokens = (values: unknown[]): string[] => {
	const tokens: string[] = [];
	const seen = new Set<string>();

	for (const value of values) {
		if (typeof value !== 'string') {
			throw new Error('AUTH_TOKENS must contain only string tokens.');
		}

		if (value.trim() === '') {
			throw new Error(
				'AUTH_TOKENS must contain unique, nonblank tokens.',
			);
		}

		if (value !== value.trim()) {
			throw new Error(
				'AUTH_TOKENS must not include surrounding whitespace.',
			);
		}

		if (seen.has(value)) {
			throw new Error('AUTH_TOKENS must be unique.');
		}

		seen.add(value);
		tokens.push(value);
	}

	return tokens;
};

const normalize_delimited_tokens = (raw: string): string[] => {
	const tokens: string[] = [];
	const seen = new Set<string>();

	for (const part of raw.split(/[,;\n]/)) {
		const token = part.trim();
		if (token === '') continue;

		if (seen.has(token)) {
			throw new Error('AUTH_TOKENS must be unique.');
		}

		seen.add(token);
		tokens.push(token);
	}

	return tokens;
};

export const is_loopback_host = (host: string): boolean => {
	const normalized = unwrap_host(host).toLowerCase();

	if (normalized === 'localhost' || normalized === '::1') {
		return true;
	}

	if (normalized.startsWith(IPV4_MAPPED_PREFIX)) {
		return is_loopback_ipv4(
			normalized.slice(IPV4_MAPPED_PREFIX.length),
		);
	}

	return is_loopback_ipv4(normalized);
};

const unwrap_host = (host: string): string => {
	if (host.startsWith('[') && host.endsWith(']')) {
		return host.slice(1, -1);
	}
	return host;
};

const is_loopback_ipv4 = (host: string): boolean => {
	const parts = host.split('.');
	if (parts.length !== 4) return false;

	const octets = parts.map((part) => Number(part));
	if (octets.some((octet) => !Number.isInteger(octet))) {
		return false;
	}

	return (
		octets[0] === 127 &&
		octets.every((octet) => octet >= 0 && octet <= 255)
	);
};

export const load_http_config = (
	env: NodeJS.ProcessEnv = process.env,
): HttpConfig => {
	const transport = parse_transport(env.TRANSPORT);
	const host = env.HOST?.trim() || DEFAULT_HOST;
	const path = normalize_http_path(env.HTTP_PATH);

	return {
		transport,
		host,
		port: parse_port(env.PORT),
		path,
		auth_tokens: parse_auth_tokens(env.AUTH_TOKENS),
		rate_limit_requests: parse_positive_int(
			env.RATE_LIMIT_REQUESTS,
			DEFAULT_RATE_LIMIT_REQUESTS,
			'RATE_LIMIT_REQUESTS',
		),
		rate_limit_window_ms:
			parse_positive_int(
				env.RATE_LIMIT_WINDOW_MINUTES,
				DEFAULT_RATE_LIMIT_WINDOW_MINUTES,
				'RATE_LIMIT_WINDOW_MINUTES',
			) * 60_000,
		unauth_rate_limit_requests: parse_positive_int(
			env.UNAUTH_RATE_LIMIT_REQUESTS,
			DEFAULT_UNAUTH_RATE_LIMIT_REQUESTS,
			'UNAUTH_RATE_LIMIT_REQUESTS',
		),
	};
};

const parse_transport = (raw: string | undefined): TransportMode => {
	const value = raw?.trim().toLowerCase();
	if (!value || value === 'stdio') return 'stdio';
	if (value === 'http') return 'http';

	throw new Error(
		`TRANSPORT must be "stdio" or "http", received "${raw}".`,
	);
};

const normalize_http_path = (raw: string | undefined): string => {
	const value = raw?.trim() || DEFAULT_PATH;
	if (!value.startsWith('/')) {
		throw new Error('HTTP_PATH must be an absolute path.');
	}
	if (value.includes('?') || value.includes('#')) {
		throw new Error(
			'HTTP_PATH must be a literal path without query or fragment.',
		);
	}
	if (value !== '/' && value.endsWith('/')) {
		return value.slice(0, -1);
	}
	if (value === '/health') {
		throw new Error(
			'HTTP_PATH cannot be /health because that path is reserved.',
		);
	}
	return value;
};

const parse_port = (raw: string | undefined): number => {
	if (raw === undefined || raw.trim() === '') return DEFAULT_PORT;

	const value = Number(raw);
	if (!Number.isInteger(value) || value < 0 || value > 65535) {
		throw new Error('PORT must be an integer between 0 and 65535.');
	}
	return value;
};

const parse_positive_int = (
	raw: string | undefined,
	fallback: number,
	name: string,
	options: { max?: number } = {},
): number => {
	if (raw === undefined || raw.trim() === '') return fallback;

	const value = Number(raw);
	if (!Number.isInteger(value) || value <= 0) {
		throw new Error(`${name} must be a positive integer.`);
	}
	if (options.max !== undefined && value > options.max) {
		throw new Error(`${name} must be between 1 and ${options.max}.`);
	}
	return value;
};

export const assert_http_can_start = (config: HttpConfig): void => {
	if (config.transport !== 'http') return;

	if (
		!is_loopback_host(config.host) &&
		config.auth_tokens.length === 0
	) {
		throw new Error(
			`Refusing to start HTTP on non-loopback bind ${config.host}:${config.port} without AUTH_TOKENS. Set unique bearer tokens or bind a loopback address.`,
		);
	}
};
