import { handle_rate_limit } from './errors.js';
import { ErrorType, ProviderError } from './types.js';

export interface HttpJsonOptions extends RequestInit {
	expectedStatuses?: number[];
}

const tryParseJson = (text: string): unknown => {
	if (!text) return undefined;
	try {
		return JSON.parse(text) as unknown;
	} catch {
		return undefined;
	}
};

const get_error_message = (body: unknown) => {
	if (typeof body !== 'object' || body === null) return undefined;
	for (const key of ['message', 'error', 'detail']) {
		if (key in body) {
			const value = body[key as keyof typeof body];
			if (typeof value === 'string') return value;
		}
	}
};

export const http_json = async <T = unknown>(
	provider: string,
	url: string,
	options: HttpJsonOptions = {},
): Promise<T> => {
	const res = await fetch(url, options);
	const raw = await res.text();
	const body = tryParseJson(raw);

	const okOrExpected =
		res.ok ||
		(options.expectedStatuses &&
			options.expectedStatuses.includes(res.status));

	if (!okOrExpected) {
		const message = get_error_message(body) || raw || res.statusText;

		switch (res.status) {
			case 401:
				throw new ProviderError(
					ErrorType.API_ERROR,
					'Invalid API key',
					provider,
				);
			case 403:
				throw new ProviderError(
					ErrorType.API_ERROR,
					'API key does not have access to this endpoint',
					provider,
				);
			case 429:
				handle_rate_limit(provider);
			default:
				if (res.status >= 500) {
					throw new ProviderError(
						ErrorType.PROVIDER_ERROR,
						`${provider} API internal error`,
						provider,
						{ status: res.status },
					);
				}
				throw new ProviderError(
					ErrorType.API_ERROR,
					`Unexpected error: ${message}`,
					provider,
					{ status: res.status },
				);
		}
	}

	// Prefer JSON if parseable, otherwise return raw text.
	return (body ?? raw) as T;
};
