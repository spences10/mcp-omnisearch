import { handle_provider_error } from '../../../common/errors.js';
import { http_json } from '../../../common/http.js';
import { retry_with_backoff } from '../../../common/retry.js';
import {
	ErrorType,
	ProcessingProvider,
	ProcessingResult,
	ProviderError,
} from '../../../common/types.js';
import { validate_api_key } from '../../../common/validation.js';
import { config } from '../../../config/env.js';

interface KagiSummarizerResponse {
	meta: {
		id: string;
		node: string;
		ms: number;
		api_balance: number;
	};
	data: {
		output: string;
		tokens: number;
	};
}

export class KagiSummarizerProvider implements ProcessingProvider {
	name = 'kagi_summarizer';
	description =
		'Instantly summarizes content of any type and length from URLs. Supports pages, videos, and podcasts with transcripts. Best for quick comprehension of long-form content and multimedia resources.';

	async process_content(url: string): Promise<ProcessingResult> {
		const api_key = validate_api_key(
			config.processing.kagi_summarizer.api_key,
			this.name,
		);

		const summarize_request = async () => {
			try {
				const data = await http_json<
					KagiSummarizerResponse & { message?: string }
				>(this.name, config.processing.kagi_summarizer.base_url, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						Authorization: `Bot ${api_key}`,
					},
					body: JSON.stringify({ url }),
					signal: AbortSignal.timeout(
						config.processing.kagi_summarizer.timeout,
					),
				});

				if (!data?.data?.output) {
					const error_message =
						(data as any)?.message || 'Empty output';
					throw new ProviderError(
						ErrorType.API_ERROR,
						`Unexpected error: ${error_message}`,
						this.name,
					);
				}

				return {
					content: data.data.output,
					metadata: {
						word_count: data.data.tokens,
					},
					source_provider: this.name,
				};
			} catch (error) {
				handle_provider_error(error, this.name, 'fetch summary');
			}
		};

		return retry_with_backoff(summarize_request);
	}
}
