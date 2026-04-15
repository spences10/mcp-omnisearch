import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from 'vitest';
import { http_json } from './http.js';
import { ErrorType } from './types.js';

const fetch_mock = vi.fn();

describe('http_json', () => {
	beforeEach(() => {
		fetch_mock.mockReset();
		vi.stubGlobal('fetch', fetch_mock);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it('returns parsed JSON for successful responses', async () => {
		fetch_mock.mockResolvedValue(
			new Response(JSON.stringify({ ok: true, value: 42 }), {
				status: 200,
				headers: { 'Content-Type': 'application/json' },
			}),
		);

		await expect(
			http_json('exa', 'https://api.example.com'),
		).resolves.toEqual({ ok: true, value: 42 });
	});

	it('returns raw text when the response body is not JSON', async () => {
		fetch_mock.mockResolvedValue(
			new Response('plain text body', { status: 200 }),
		);

		await expect(
			http_json('exa', 'https://api.example.com'),
		).resolves.toBe('plain text body');
	});

	it('allows configured non-2xx statuses', async () => {
		fetch_mock.mockResolvedValue(
			new Response('not found but expected', { status: 404 }),
		);

		await expect(
			http_json('exa', 'https://api.example.com', {
				expectedStatuses: [404],
			}),
		).resolves.toBe('not found but expected');
	});

	it('throws a specific error for 401 responses', async () => {
		fetch_mock.mockResolvedValue(
			new Response('nope', { status: 401 }),
		);

		await expect(
			http_json('kagi', 'https://api.example.com'),
		).rejects.toMatchObject({
			type: ErrorType.API_ERROR,
			provider: 'kagi',
			message: 'Invalid API key',
		});
	});

	it('throws a specific error for 403 responses', async () => {
		fetch_mock.mockResolvedValue(
			new Response('forbidden', { status: 403 }),
		);

		await expect(
			http_json('kagi', 'https://api.example.com'),
		).rejects.toMatchObject({
			type: ErrorType.API_ERROR,
			provider: 'kagi',
			message: 'API key does not have access to this endpoint',
		});
	});

	it('surfaces rate limit errors for 429 responses', async () => {
		fetch_mock.mockResolvedValue(
			new Response('slow down', { status: 429 }),
		);

		await expect(
			http_json('brave', 'https://api.example.com'),
		).rejects.toMatchObject({
			type: ErrorType.RATE_LIMIT,
			provider: 'brave',
			message: 'Rate limit exceeded for brave',
		});
	});

	it('converts 5xx responses into provider errors', async () => {
		fetch_mock.mockResolvedValue(
			new Response('server error', { status: 503 }),
		);

		await expect(
			http_json('tavily', 'https://api.example.com'),
		).rejects.toMatchObject({
			type: ErrorType.PROVIDER_ERROR,
			provider: 'tavily',
			message: 'tavily API internal error',
		});
	});

	it('includes parsed error message details for other failures', async () => {
		fetch_mock.mockResolvedValue(
			new Response(JSON.stringify({ detail: 'bad request body' }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' },
			}),
		);

		await expect(
			http_json('exa', 'https://api.example.com'),
		).rejects.toMatchObject({
			type: ErrorType.API_ERROR,
			provider: 'exa',
			message: 'Unexpected error: bad request body',
		});
	});
});
