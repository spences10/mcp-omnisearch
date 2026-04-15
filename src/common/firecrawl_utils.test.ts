import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from 'vitest';

vi.mock('./http.js', () => ({
	http_json: vi.fn(),
}));

import {
	make_firecrawl_request,
	poll_firecrawl_job,
	validate_firecrawl_response,
} from './firecrawl_utils.js';
import { http_json } from './http.js';
import { ErrorType } from './types.js';

const http_json_mock = vi.mocked(http_json);

describe('make_firecrawl_request', () => {
	beforeEach(() => {
		http_json_mock.mockReset();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('sends a POST request with bearer auth and JSON body', async () => {
		http_json_mock.mockResolvedValue({ success: true, id: 'job-1' });

		await expect(
			make_firecrawl_request(
				'firecrawl',
				'https://api.firecrawl.dev/v2/scrape',
				'secret-key',
				{ url: 'https://example.com' },
				5000,
			),
		).resolves.toEqual({ success: true, id: 'job-1' });

		expect(http_json_mock).toHaveBeenCalledWith(
			'firecrawl',
			'https://api.firecrawl.dev/v2/scrape',
			expect.objectContaining({
				method: 'POST',
				headers: {
					Authorization: 'Bearer secret-key',
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ url: 'https://example.com' }),
				signal: expect.any(AbortSignal),
			}),
		);
	});
});

describe('validate_firecrawl_response', () => {
	it('accepts successful responses without an error field', () => {
		expect(() =>
			validate_firecrawl_response(
				{ success: true },
				'firecrawl',
				'Scrape failed',
			),
		).not.toThrow();
	});

	it('throws when the response is unsuccessful', () => {
		expect(() =>
			validate_firecrawl_response(
				{ success: false, error: 'invalid URL' },
				'firecrawl',
				'Scrape failed',
			),
		).toThrowError(
			expect.objectContaining({
				type: ErrorType.PROVIDER_ERROR,
				provider: 'firecrawl',
				message: 'Scrape failed: invalid URL',
			}),
		);
	});
});

describe('poll_firecrawl_job', () => {
	beforeEach(() => {
		http_json_mock.mockReset();
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it('retries through transient polling failures and resolves on completion', async () => {
		http_json_mock
			.mockRejectedValueOnce(new Error('temporary network issue'))
			.mockResolvedValueOnce({
				success: true,
				status: 'processing',
			})
			.mockResolvedValueOnce({
				success: true,
				status: 'completed',
				data: { pages: 3 },
			});

		const promise = poll_firecrawl_job({
			provider_name: 'firecrawl',
			status_url: 'https://api.firecrawl.dev/v2/jobs/123',
			api_key: 'secret-key',
			max_attempts: 3,
			poll_interval: 10,
			timeout: 5000,
		});

		await vi.advanceTimersByTimeAsync(30);

		await expect(promise).resolves.toEqual({
			success: true,
			status: 'completed',
			data: { pages: 3 },
		});
		expect(http_json_mock).toHaveBeenCalledTimes(3);
	});

	it('throws when the polled job reports an error status', async () => {
		http_json_mock.mockResolvedValue({
			success: true,
			status: 'error',
			error: 'crawl crashed',
		});

		const promise = poll_firecrawl_job({
			provider_name: 'firecrawl',
			status_url: 'https://api.firecrawl.dev/v2/jobs/123',
			api_key: 'secret-key',
			max_attempts: 1,
			poll_interval: 10,
			timeout: 5000,
		});
		const rejection = expect(promise).rejects.toMatchObject({
			type: ErrorType.PROVIDER_ERROR,
			provider: 'firecrawl',
			message: 'Job failed: crawl crashed',
		});

		await vi.advanceTimersByTimeAsync(10);
		await rejection;
	});

	it('times out after the configured number of attempts', async () => {
		http_json_mock.mockResolvedValue({
			success: true,
			status: 'processing',
		});

		const promise = poll_firecrawl_job({
			provider_name: 'firecrawl',
			status_url: 'https://api.firecrawl.dev/v2/jobs/123',
			api_key: 'secret-key',
			max_attempts: 2,
			poll_interval: 10,
			timeout: 5000,
		});
		const rejection = expect(promise).rejects.toMatchObject({
			type: ErrorType.PROVIDER_ERROR,
			provider: 'firecrawl',
			message:
				'Job timed out - try again later or with a smaller scope',
		});

		await vi.advanceTimersByTimeAsync(20);
		await rejection;
	});
});
