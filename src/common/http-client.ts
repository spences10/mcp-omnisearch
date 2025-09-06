import { ErrorType, ProviderError } from './types.js';
import { retry_with_backoff } from './utils.js';

export interface HttpClientOptions {
	timeout?: number;
	max_retries?: number;
	initial_delay?: number;
	headers?: Record<string, string>;
}

export interface HttpResponse<T = any> {
	data: T;
	status: number;
	status_text: string;
	headers: Headers;
}

export class HttpClient {
	private default_timeout = 30000; // 30 seconds
	private default_max_retries = 3;
	private default_initial_delay = 1000;

	constructor(private options: HttpClientOptions = {}) {}

	private async make_request<T>(
		url: string,
		init: RequestInit,
		provider_name: string,
	): Promise<HttpResponse<T>> {
		const timeout = this.options.timeout || this.default_timeout;
		const controller = new AbortController();
		const timeout_id = setTimeout(() => controller.abort(), timeout);

		try {
			const response = await fetch(url, {
				...init,
				signal: controller.signal,
				headers: {
					...this.options.headers,
					...init.headers,
				},
			});

			clearTimeout(timeout_id);

			const data = await response.json();

			if (!response.ok) {
				this.handle_http_error(response, data, provider_name);
			}

			return {
				data,
				status: response.status,
				status_text: response.statusText,
				headers: response.headers,
			};
		} catch (error) {
			clearTimeout(timeout_id);

			if (error instanceof ProviderError) {
				throw error;
			}

			if (controller.signal.aborted) {
				throw new ProviderError(
					ErrorType.API_ERROR,
					`Request timeout after ${timeout}ms`,
					provider_name,
				);
			}

			throw new ProviderError(
				ErrorType.API_ERROR,
				`Network error: ${error instanceof Error ? error.message : 'Unknown error'}`,
				provider_name,
			);
		}
	}

	private handle_http_error(
		response: Response,
		data: any,
		provider_name: string,
	): never {
		const error_message = data.message || data.error || response.statusText;

		switch (response.status) {
			case 401:
				throw new ProviderError(
					ErrorType.API_ERROR,
					'Invalid API key',
					provider_name,
				);
			case 403:
				throw new ProviderError(
					ErrorType.API_ERROR,
					'API key does not have access to this endpoint',
					provider_name,
				);
			case 429:
				const reset_time = response.headers.get('x-ratelimit-reset');
				const reset_date = reset_time ? new Date(reset_time) : undefined;
				throw new ProviderError(
					ErrorType.RATE_LIMIT,
					`Rate limit exceeded for ${provider_name}${
						reset_date ? `. Reset at ${reset_date.toISOString()}` : ''
					}`,
					provider_name,
					{ reset_time: reset_date },
				);
			case 500:
			case 502:
			case 503:
			case 504:
				throw new ProviderError(
					ErrorType.PROVIDER_ERROR,
					`${provider_name} API internal error`,
					provider_name,
				);
			default:
				throw new ProviderError(
					ErrorType.API_ERROR,
					`Unexpected error: ${error_message}`,
					provider_name,
				);
		}
	}

	async get<T>(
		url: string,
		provider_name: string,
		options: HttpClientOptions = {},
	): Promise<HttpResponse<T>> {
		const max_retries = options.max_retries || this.default_max_retries;
		const initial_delay = options.initial_delay || this.default_initial_delay;

		return retry_with_backoff(
			() => this.make_request<T>(url, { method: 'GET' }, provider_name),
			max_retries,
			initial_delay,
		);
	}

	async post<T>(
		url: string,
		body: any,
		provider_name: string,
		options: HttpClientOptions = {},
	): Promise<HttpResponse<T>> {
		const max_retries = options.max_retries || this.default_max_retries;
		const initial_delay = options.initial_delay || this.default_initial_delay;

		return retry_with_backoff(
			() =>
				this.make_request<T>(
					url,
					{
						method: 'POST',
						headers: {
							'Content-Type': 'application/json',
						},
						body: JSON.stringify(body),
					},
					provider_name,
				),
			max_retries,
			initial_delay,
		);
	}

	async put<T>(
		url: string,
		body: any,
		provider_name: string,
		options: HttpClientOptions = {},
	): Promise<HttpResponse<T>> {
		const max_retries = options.max_retries || this.default_max_retries;
		const initial_delay = options.initial_delay || this.default_initial_delay;

		return retry_with_backoff(
			() =>
				this.make_request<T>(
					url,
					{
						method: 'PUT',
						headers: {
							'Content-Type': 'application/json',
						},
						body: JSON.stringify(body),
					},
					provider_name,
				),
			max_retries,
			initial_delay,
		);
	}

	async patch<T>(
		url: string,
		body: any,
		provider_name: string,
		options: HttpClientOptions = {},
	): Promise<HttpResponse<T>> {
		const max_retries = options.max_retries || this.default_max_retries;
		const initial_delay = options.initial_delay || this.default_initial_delay;

		return retry_with_backoff(
			() =>
				this.make_request<T>(
					url,
					{
						method: 'PATCH',
						headers: {
							'Content-Type': 'application/json',
						},
						body: JSON.stringify(body),
					},
					provider_name,
				),
			max_retries,
			initial_delay,
		);
	}

	async delete<T>(
		url: string,
		provider_name: string,
		options: HttpClientOptions = {},
	): Promise<HttpResponse<T>> {
		const max_retries = options.max_retries || this.default_max_retries;
		const initial_delay = options.initial_delay || this.default_initial_delay;

		return retry_with_backoff(
			() => this.make_request<T>(url, { method: 'DELETE' }, provider_name),
			max_retries,
			initial_delay,
		);
	}

	with_auth(api_key: string, auth_type: 'bearer' | 'api-key' = 'bearer'): HttpClient {
		const auth_headers: Record<string, string> = {};
		
		if (auth_type === 'bearer') {
			auth_headers['Authorization'] = `Bearer ${api_key}`;
		} else {
			auth_headers['X-API-Key'] = api_key;
		}

		return new HttpClient({
			...this.options,
			headers: {
				...this.options.headers,
				...auth_headers,
			},
		});
	}

	with_headers(headers: Record<string, string>): HttpClient {
		return new HttpClient({
			...this.options,
			headers: {
				...this.options.headers,
				...headers,
			},
		});
	}

	with_timeout(timeout: number): HttpClient {
		return new HttpClient({
			...this.options,
			timeout,
		});
	}

	with_retry(max_retries: number, initial_delay?: number): HttpClient {
		return new HttpClient({
			...this.options,
			max_retries,
			initial_delay: initial_delay || this.default_initial_delay,
		});
	}
}

export const create_http_client = (options?: HttpClientOptions): HttpClient => {
	return new HttpClient(options);
};