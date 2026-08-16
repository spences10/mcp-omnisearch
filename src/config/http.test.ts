import { describe, expect, it } from 'vitest';
import {
	assert_http_can_start,
	is_loopback_host,
	load_http_config,
	parse_auth_tokens,
} from './http.js';

describe('parse_auth_tokens', () => {
	it('returns an empty list when unset or blank', () => {
		expect(parse_auth_tokens(undefined)).toEqual([]);
		expect(parse_auth_tokens('')).toEqual([]);
		expect(parse_auth_tokens('   ')).toEqual([]);
		expect(parse_auth_tokens('[]')).toEqual([]);
	});

	it('parses a JSON array of unique nonblank tokens', () => {
		expect(parse_auth_tokens('["alpha","beta"]')).toEqual([
			'alpha',
			'beta',
		]);
	});

	it('parses comma, semicolon, and newline separated tokens', () => {
		expect(parse_auth_tokens('alpha, beta')).toEqual([
			'alpha',
			'beta',
		]);
		expect(parse_auth_tokens('alpha;beta')).toEqual([
			'alpha',
			'beta',
		]);
		expect(parse_auth_tokens('alpha\nbeta')).toEqual([
			'alpha',
			'beta',
		]);
	});

	it('rejects blank, padded, or duplicate JSON tokens', () => {
		expect(() => parse_auth_tokens('["alpha",""]')).toThrow(
			/nonblank/i,
		);
		expect(() => parse_auth_tokens('[" token"]')).toThrow(
			/whitespace/i,
		);
		expect(() => parse_auth_tokens('["token "]')).toThrow(
			/whitespace/i,
		);
		expect(() => parse_auth_tokens('["alpha","alpha"]')).toThrow(
			/unique/i,
		);
	});
});

describe('is_loopback_host', () => {
	it('treats loopback names and addresses as local', () => {
		expect(is_loopback_host('127.0.0.1')).toBe(true);
		expect(is_loopback_host('127.1.2.3')).toBe(true);
		expect(is_loopback_host('localhost')).toBe(true);
		expect(is_loopback_host('::1')).toBe(true);
		expect(is_loopback_host('[::1]')).toBe(true);
		expect(is_loopback_host('::ffff:127.0.0.1')).toBe(true);
	});

	it('treats wildcard and routable binds as non-loopback', () => {
		expect(is_loopback_host('0.0.0.0')).toBe(false);
		expect(is_loopback_host('::')).toBe(false);
		expect(is_loopback_host('[::]')).toBe(false);
		expect(is_loopback_host('192.168.1.10')).toBe(false);
		expect(is_loopback_host('::ffff:10.0.0.1')).toBe(false);
	});
});

describe('load_http_config', () => {
	it('defaults to stdio with loopback HTTP settings unused', () => {
		const config = load_http_config({});

		expect(config.transport).toBe('stdio');
		expect(config.host).toBe('127.0.0.1');
		expect(config.port).toBe(8080);
		expect(config.path).toBe('/mcp');
		expect(config.auth_tokens).toEqual([]);
		expect(config.rate_limit_requests).toBe(120);
		expect(config.rate_limit_window_ms).toBe(60_000);
		expect(config.unauth_rate_limit_requests).toBe(20);
	});

	it('reads HTTP bind, tokens, and rate-limit settings', () => {
		const config = load_http_config({
			TRANSPORT: 'http',
			HOST: '0.0.0.0',
			PORT: '9000',
			HTTP_PATH: '/mcp',
			AUTH_TOKENS: 'alpha,beta',
			RATE_LIMIT_REQUESTS: '60',
			RATE_LIMIT_WINDOW_MINUTES: '2',
			UNAUTH_RATE_LIMIT_REQUESTS: '5',
		});

		expect(config).toMatchObject({
			transport: 'http',
			host: '0.0.0.0',
			port: 9000,
			path: '/mcp',
			auth_tokens: ['alpha', 'beta'],
			rate_limit_requests: 60,
			rate_limit_window_ms: 120_000,
			unauth_rate_limit_requests: 5,
		});
	});

	it('rejects invalid numeric HTTP settings', () => {
		expect(() => load_http_config({ PORT: '-1' })).toThrow(/port/i);
		expect(() =>
			load_http_config({ RATE_LIMIT_REQUESTS: '0' }),
		).toThrow(/rate/i);
		expect(() =>
			load_http_config({ RATE_LIMIT_WINDOW_MINUTES: '-1' }),
		).toThrow(/window/i);
	});

	it('allows ephemeral PORT=0 and reserves /health', () => {
		expect(load_http_config({ PORT: '0' }).port).toBe(0);
		expect(() => load_http_config({ HTTP_PATH: '/health' })).toThrow(
			/health/,
		);
	});
});

describe('assert_http_can_start', () => {
	it('refuses non-loopback HTTP without tokens', () => {
		expect(() =>
			assert_http_can_start(
				load_http_config({
					TRANSPORT: 'http',
					HOST: '0.0.0.0',
				}),
			),
		).toThrow(/AUTH_TOKENS/);
	});

	it('allows loopback HTTP without tokens and remote HTTP with tokens', () => {
		expect(() =>
			assert_http_can_start(
				load_http_config({
					TRANSPORT: 'http',
					HOST: '127.0.0.1',
				}),
			),
		).not.toThrow();

		expect(() =>
			assert_http_can_start(
				load_http_config({
					TRANSPORT: 'http',
					HOST: '0.0.0.0',
					AUTH_TOKENS: 'secret-token',
				}),
			),
		).not.toThrow();
	});

	it('does not require tokens for stdio', () => {
		expect(() =>
			assert_http_can_start(
				load_http_config({
					HOST: '0.0.0.0',
				}),
			),
		).not.toThrow();
	});
});
