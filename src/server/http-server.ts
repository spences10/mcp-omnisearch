import {
	createServer,
	type IncomingMessage,
	type Server,
} from 'node:http';
import type { AddressInfo } from 'node:net';
import { Readable } from 'node:stream';
import {
	assert_http_can_start,
	type HttpConfig,
} from '../config/http.js';
import {
	extract_bearer_token,
	match_auth_token,
} from './http-auth.js';
import {
	create_sliding_window_limiter,
	type RateLimitDecision,
	type SlidingWindowLimiter,
} from './http-rate-limit.js';

const UNAUTHENTICATED_KEY = 'unauthenticated';
const HEALTH_PATH = '/health';

export type HttpRequestHandlers = {
	config: HttpConfig;
	limiter: SlidingWindowLimiter;
	unauth_limiter?: SlidingWindowLimiter;
	respond_mcp: (request: Request) => Promise<Response | null>;
};

export type HttpServerHandle = {
	port: number;
	close: () => Promise<void>;
};

export const handle_http_request = async (
	request: Request,
	handlers: HttpRequestHandlers,
): Promise<Response> => {
	const url = new URL(request.url);
	if (is_health_path(url.pathname)) {
		return health_response(request.method);
	}

	const authorization =
		request.headers.get('authorization') ?? undefined;
	const presented = extract_bearer_token(authorization);
	const matched = presented
		? match_auth_token(presented, handlers.config.auth_tokens)
		: undefined;
	const tokens_configured = handlers.config.auth_tokens.length > 0;

	if (tokens_configured && !matched) {
		const unauth = consume_unauth(handlers);
		if (!unauth.allowed) {
			return rate_limit_response(unauth);
		}
		return unauthorized_response();
	}

	const decision = matched
		? handlers.limiter.consume(matched)
		: consume_unauth(handlers);
	if (!decision.allowed) {
		return rate_limit_response(decision);
	}

	const mcp_response = await handlers.respond_mcp(request);
	return mcp_response ?? new Response(null, { status: 404 });
};

const consume_unauth = (
	handlers: HttpRequestHandlers,
): RateLimitDecision => {
	const limiter = handlers.unauth_limiter ?? handlers.limiter;
	return limiter.consume(UNAUTHENTICATED_KEY);
};

const is_health_path = (pathname: string): boolean => {
	if (pathname === HEALTH_PATH) return true;
	return pathname === `${HEALTH_PATH}/`;
};

const health_response = (method: string): Response => {
	if (method !== 'GET' && method !== 'HEAD') {
		return new Response(null, {
			status: 405,
			headers: { Allow: 'GET, HEAD' },
		});
	}

	return new Response(
		method === 'HEAD' ? null : JSON.stringify({ status: 'ok' }),
		{
			status: 200,
			headers: { 'Content-Type': 'application/json' },
		},
	);
};

const unauthorized_response = (): Response =>
	new Response(JSON.stringify({ error: 'unauthorized' }), {
		status: 401,
		headers: {
			'Content-Type': 'application/json',
			'WWW-Authenticate': 'Bearer realm="mcp-omnisearch"',
		},
	});

const rate_limit_response = (decision: RateLimitDecision): Response =>
	new Response(JSON.stringify({ error: 'rate_limit_exceeded' }), {
		status: 429,
		headers: {
			'Content-Type': 'application/json',
			'Retry-After': String(decision.retry_after_seconds),
			'RateLimit-Limit': String(decision.limit),
			'RateLimit-Remaining': '0',
			'RateLimit-Reset': String(decision.retry_after_seconds),
		},
	});

export const start_http_listener = async (
	config: HttpConfig,
	respond_mcp: (request: Request) => Promise<Response | null>,
	limiters?: {
		limiter?: SlidingWindowLimiter;
		unauth_limiter?: SlidingWindowLimiter;
	},
): Promise<HttpServerHandle> => {
	assert_http_can_start(config);

	const limiter =
		limiters?.limiter ??
		create_sliding_window_limiter({
			max_requests: config.rate_limit_requests,
			window_ms: config.rate_limit_window_ms,
		});
	const unauth_limiter =
		limiters?.unauth_limiter ??
		create_sliding_window_limiter({
			max_requests: config.unauth_rate_limit_requests,
			window_ms: config.rate_limit_window_ms,
		});

	const server = createServer((req, res) => {
		void handle_node_request(req, res, {
			config,
			limiter,
			unauth_limiter,
			respond_mcp,
		});
	});

	await listen(server, config.port, config.host);
	const address = server.address() as AddressInfo;

	console.error(
		`Omnisearch MCP server running on http://${config.host}:${address.port}${config.path} (${config.auth_tokens.length} auth token(s), ${config.rate_limit_requests} req / ${config.rate_limit_window_ms / 1000}s per token)`,
	);

	return {
		port: address.port,
		close: () =>
			new Promise((resolve, reject) => {
				server.close((error) => {
					if (error) reject(error);
					else resolve();
				});
			}),
	};
};

const handle_node_request = async (
	req: IncomingMessage,
	res: import('node:http').ServerResponse,
	handlers: HttpRequestHandlers,
): Promise<void> => {
	try {
		const request = await incoming_to_request(req);
		const response = await handle_http_request(request, handlers);
		await write_node_response(res, response);
	} catch (error) {
		console.error(
			`HTTP request failed: ${
				error instanceof Error ? error.message : 'unknown error'
			}`,
		);
		if (!res.headersSent) {
			res.statusCode = 500;
			res.setHeader('Content-Type', 'application/json');
			res.end(JSON.stringify({ error: 'internal_error' }));
			return;
		}
		res.end();
	}
};

const incoming_to_request = async (
	req: IncomingMessage,
): Promise<Request> => {
	const host = req.headers.host ?? '127.0.0.1';
	const url = `http://${host}${req.url ?? '/'}`;
	const method = req.method ?? 'GET';
	const headers = new Headers();

	for (const [key, value] of Object.entries(req.headers)) {
		if (value === undefined) continue;
		if (Array.isArray(value)) {
			for (const item of value) headers.append(key, item);
		} else {
			headers.set(key, value);
		}
	}

	const can_have_body = method !== 'GET' && method !== 'HEAD';
	return new Request(url, {
		method,
		headers,
		body: can_have_body ? Readable.toWeb(req) : undefined,
		duplex: 'half',
	} as RequestInit);
};

const write_node_response = async (
	res: import('node:http').ServerResponse,
	response: Response,
): Promise<void> => {
	res.statusCode = response.status;
	response.headers.forEach((value, key) => {
		res.setHeader(key, value);
	});

	if (!response.body) {
		res.end();
		return;
	}

	const reader = response.body.getReader();
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			res.write(value);
		}
	} finally {
		res.end();
	}
};

const listen = (
	server: Server,
	port: number,
	host: string,
): Promise<void> =>
	new Promise((resolve, reject) => {
		server.once('error', reject);
		server.listen(port, host, () => {
			server.off('error', reject);
			resolve();
		});
	});
