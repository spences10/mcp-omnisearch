import { http_json } from './http.js';
import { ErrorType, ProviderError } from './types.js';

export const make_firecrawl_request = async <T>(
	provider_name: string,
	base_url: string,
	api_key: string,
	body: Record<string, any>,
	timeout: number,
): Promise<T> => {
	return http_json<T>(provider_name, base_url, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${api_key}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify(body),
		signal: AbortSignal.timeout(timeout),
	});
};

export const validate_firecrawl_response = (
	data: { success: boolean; error?: string },
	provider_name: string,
	error_message: string,
): void => {
	if (!data.success || data.error) {
		throw new ProviderError(
			ErrorType.PROVIDER_ERROR,
			`${error_message}: ${data.error || 'Unknown error'}`,
			provider_name,
		);
	}
};

export interface PollingConfig {
	provider_name: string;
	status_url: string;
	api_key: string;
	max_attempts: number;
	poll_interval: number;
	timeout: number;
}

export const poll_firecrawl_job = async <
	T extends {
		success: boolean;
		status: string;
		error?: string;
		data?: any;
	},
>(
	config: PollingConfig,
): Promise<T> => {
	let attempts = 0;

	while (attempts < config.max_attempts) {
		attempts++;
		await new Promise((resolve) =>
			setTimeout(resolve, config.poll_interval),
		);

		let status_result: T;
		try {
			status_result = await http_json<T>(
				config.provider_name,
				config.status_url,
				{
					method: 'GET',
					headers: {
						Authorization: `Bearer ${config.api_key}`,
					},
					signal: AbortSignal.timeout(config.timeout),
				},
			);
		} catch {
			continue;
		}

		if (!status_result.success) {
			throw new ProviderError(
				ErrorType.PROVIDER_ERROR,
				`Error checking job status: ${status_result.error || 'Unknown error'}`,
				config.provider_name,
			);
		}

		if (status_result.status === 'completed' && status_result.data) {
			return status_result;
		} else if (status_result.status === 'error') {
			throw new ProviderError(
				ErrorType.PROVIDER_ERROR,
				`Job failed: ${status_result.error || 'Unknown error'}`,
				config.provider_name,
			);
		}
	}

	throw new ProviderError(
		ErrorType.PROVIDER_ERROR,
		'Job timed out - try again later or with a smaller scope',
		config.provider_name,
	);
};
