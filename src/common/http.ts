import { handle_rate_limit } from './errors.js';
import { ErrorType, ProviderError } from './types.js';

export interface HttpJsonOptions extends RequestInit {
	expectedStatuses?: number[];
}

const tryParseJson = (text: string) => {
	if (!text) return undefined;
	try {
		return JSON.parse(text);
	} catch {
		return undefined;
	}
};

export const http_json = async <T = any>(
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
		const message =
			(body && (body.message || body.error || body.detail)) ||
			raw ||
			res.statusText;

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
					);
				}
				throw new ProviderError(
					ErrorType.API_ERROR,
					`Unexpected error: ${message}`,
					provider,
				);
		}
	}

	// Prefer JSON if parseable, otherwise return as any
	return (body as T) ?? (raw as unknown as T);
};
