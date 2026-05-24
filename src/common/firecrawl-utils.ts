import * as v from 'valibot';
import { http_json } from './http.js';
import { parse_provider_response } from './provider-response.js';
import { ErrorType, ProviderError } from './types.js';

export const make_firecrawl_request = async <
	const TSchema extends v.BaseSchema<
		unknown,
		unknown,
		v.BaseIssue<unknown>
	>,
>(
	provider_name: string,
	base_url: string,
	api_key: string,
	body: Record<string, unknown>,
	timeout: number,
	schema: TSchema,
): Promise<v.InferOutput<TSchema>> => {
	const data = await http_json(provider_name, base_url, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${api_key}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify(body),
		signal: AbortSignal.timeout(timeout),
	});

	return parse_provider_response(provider_name, schema, data);
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
	const TSchema extends v.BaseSchema<
		unknown,
		unknown,
		v.BaseIssue<unknown>
	>,
>(
	config: PollingConfig,
	schema: TSchema,
): Promise<
	v.InferOutput<TSchema> & {
		success: boolean;
		status: string;
		error?: string;
		data?: unknown;
	}
> => {
	let attempts = 0;

	while (attempts < config.max_attempts) {
		attempts++;
		await new Promise((resolve) =>
			setTimeout(resolve, config.poll_interval),
		);

		let status_result: v.InferOutput<TSchema> & {
			success: boolean;
			status: string;
			error?: string;
			data?: unknown;
		};
		try {
			const raw_status_result = await http_json(
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
			status_result = parse_provider_response(
				config.provider_name,
				schema,
				raw_status_result,
			) as typeof status_result;
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
