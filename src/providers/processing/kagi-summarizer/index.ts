import * as v from 'valibot';
import { handle_provider_error } from '../../../common/errors.js';
import { http_json } from '../../../common/http.js';
import { parse_provider_response } from '../../../common/provider-response.js';
import { retry_with_backoff } from '../../../common/retry.js';
import {
	ProcessingProvider,
	ProcessingResult,
} from '../../../common/types.js';
import { validate_api_key } from '../../../common/validation.js';
import { config } from '../../../config/env.js';

const kagi_summarizer_response_schema = v.object({
	meta: v.object({
		id: v.string(),
		node: v.string(),
		ms: v.number(),
		api_balance: v.optional(v.number()),
	}),
	data: v.object({
		output: v.string(),
		tokens: v.number(),
	}),
});

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
				const raw_data = await http_json(
					this.name,
					config.processing.kagi_summarizer.base_url,
					{
						method: 'POST',
						headers: {
							'Content-Type': 'application/json',
							Authorization: `Bot ${api_key}`,
						},
						body: JSON.stringify({ url }),
						signal: AbortSignal.timeout(
							config.processing.kagi_summarizer.timeout,
						),
					},
				);
				const data = parse_provider_response(
					this.name,
					kagi_summarizer_response_schema,
					raw_data,
				);

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
