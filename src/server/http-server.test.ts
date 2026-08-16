import { afterEach, describe, expect, it, vi } from 'vitest';
import { load_http_config } from '../config/http.js';
import { create_sliding_window_limiter } from './http-rate-limit.js';
import {
	handle_http_request,
	start_http_listener,
} from './http-server.js';

const mcp_ok = vi.fn(async () => new Response('ok', { status: 200 }));

const request = (path: string, init: RequestInit = {}): Request =>
	new Request(`http://127.0.0.1:8080${path}`, init);

const handle = (
	req: Request,
	env: NodeJS.ProcessEnv,
	respond_mcp = mcp_ok,
	limiter = create_sliding_window_limiter({
		max_requests: 120,
		window_ms: 60_000,
	}),
) =>
	handle_http_request(req, {
		config: load_http_config(env),
		limiter,
		respond_mcp,
	});

describe('handle_http_request', () => {
	afterEach(() => {
		mcp_ok.mockClear();
	});

	it('keeps /health free of auth and rate limits', async () => {
		const limiter = create_sliding_window_limiter({
			max_requests: 1,
			window_ms: 60_000,
		});
		const env = { AUTH_TOKENS: 'secret-token' };

		const health = await handle(
			request('/health'),
			env,
			mcp_ok,
			limiter,
		);
		expect(health.status).toBe(200);
		await expect(health.json()).resolves.toEqual({ status: 'ok' });

		const again = await handle(
			request('/health'),
			env,
			mcp_ok,
			limiter,
		);
		expect(again.status).toBe(200);
		expect(mcp_ok).not.toHaveBeenCalled();
	});

	it('rejects MCP traffic without a valid bearer token when tokens are configured', async () => {
		const env = { AUTH_TOKENS: 'secret-token' };

		const missing = await handle(
			request('/mcp', { method: 'POST' }),
			env,
		);
		expect(missing.status).toBe(401);
		expect(missing.headers.get('WWW-Authenticate')).toMatch(
			/Bearer/i,
		);

		const invalid = await handle(
			request('/mcp', {
				method: 'POST',
				headers: { Authorization: 'Bearer wrong' },
			}),
			env,
		);
		expect(invalid.status).toBe(401);
		expect(mcp_ok).not.toHaveBeenCalled();
	});

	it('forwards authenticated MCP requests and rate-limits per token', async () => {
		const env = { AUTH_TOKENS: 'secret-token' };
		const limiter = create_sliding_window_limiter({
			max_requests: 1,
			window_ms: 60_000,
		});
		const headers = { Authorization: 'Bearer secret-token' };

		const allowed = await handle(
			request('/mcp', { method: 'POST', headers }),
			env,
			mcp_ok,
			limiter,
		);
		expect(allowed.status).toBe(200);
		expect(mcp_ok).toHaveBeenCalledOnce();

		const blocked = await handle(
			request('/mcp', { method: 'POST', headers }),
			env,
			mcp_ok,
			limiter,
		);
		expect(blocked.status).toBe(429);
		expect(blocked.headers.get('Retry-After')).toBeTruthy();
		expect(mcp_ok).toHaveBeenCalledOnce();
	});

	it('shares one tight unauthenticated bucket when tokens are not required', async () => {
		const env = { TRANSPORT: 'http', HOST: '127.0.0.1' };
		const tight = create_sliding_window_limiter({
			max_requests: 1,
			window_ms: 60_000,
		});

		const first = await handle(
			request('/mcp', { method: 'POST' }),
			env,
			mcp_ok,
			tight,
		);
		expect(first.status).toBe(200);

		const second = await handle(
			request('/mcp', { method: 'POST' }),
			env,
			mcp_ok,
			tight,
		);
		expect(second.status).toBe(429);
	});

	it('listens on loopback and keeps /health unauthenticated', async () => {
		const handle = await start_http_listener(
			load_http_config({
				TRANSPORT: 'http',
				HOST: '127.0.0.1',
				PORT: '0',
				AUTH_TOKENS: 'secret-token',
			}),
			mcp_ok,
		);

		try {
			const health = await fetch(
				`http://127.0.0.1:${handle.port}/health`,
			);
			expect(health.status).toBe(200);
			await expect(health.json()).resolves.toEqual({
				status: 'ok',
			});

			const denied = await fetch(
				`http://127.0.0.1:${handle.port}/mcp`,
				{ method: 'POST' },
			);
			expect(denied.status).toBe(401);
		} finally {
			await handle.close();
		}
	});

	it('refuses to listen on a non-loopback bind without tokens', async () => {
		await expect(
			start_http_listener(
				load_http_config({
					TRANSPORT: 'http',
					HOST: '0.0.0.0',
					PORT: '0',
				}),
				mcp_ok,
			),
		).rejects.toThrow(/AUTH_TOKENS/);
	});
});
