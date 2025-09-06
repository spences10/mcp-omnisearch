import { AbstractProcessingProvider } from '../../../common/abstract-processing-provider.js';
import { ProcessingResult } from '../../../common/types.js';
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

export class KagiSummarizerProvider extends AbstractProcessingProvider {
	readonly name = 'kagi_summarizer';
	readonly description =
		'Instantly summarizes content of any type and length from URLs. Supports pages, videos, and podcasts with transcripts. Best for quick comprehension of long-form content and multimedia resources.';

	constructor() {
		super(
			{
				api_key: config.processing.kagi_summarizer.api_key || '',
				base_url: config.processing.kagi_summarizer.base_url,
				timeout: config.processing.kagi_summarizer.timeout,
				auth_type: 'bearer',
				custom_headers: {
					Authorization: `Bot ${
						config.processing.kagi_summarizer.api_key || ''
					}`,
				},
			},
			'kagi_summarizer',
			{
				allow_single_url: true,
				allow_multiple_urls: true,
				max_urls: 5, // Reasonable limit for summarization
			},
		);
	}

	async process_content(
		url: string | string[],
		extract_depth: 'basic' | 'advanced' = 'basic',
	): Promise<ProcessingResult> {
		const { urls, validated_depth } = this.validate_input(
			url,
			extract_depth,
		);

		const process_urls = async () => {
			const results = await Promise.all(
				urls.map(async (single_url) => {
					const response =
						await this.http_client.post<KagiSummarizerResponse>(
							'/',
							{
								url: single_url,
								summary_type:
									validated_depth === 'advanced'
										? 'takeaway'
										: 'summary',
							},
							this.name,
						);

					return {
						url: single_url,
						content: response.data.data.output,
						title: `Summary of ${single_url}`,
						metadata: {
							tokens_used: response.data.data.tokens,
							summary_type:
								validated_depth === 'advanced'
									? 'takeaway'
									: 'summary',
							api_balance: response.data.meta.api_balance,
							processing_time_ms: response.data.meta.ms,
						},
					};
				}),
			);

			const aggregated = this.aggregate_content(results);
			const metadata = this.calculate_metadata(
				urls,
				validated_depth,
				{
					total_word_count: aggregated.total_word_count,
					total_tokens: results.reduce(
						(sum, r) => sum + (r.metadata.tokens_used || 0),
						0,
					),
				},
			);

			return {
				content: aggregated.combined_content,
				metadata,
				raw_contents: aggregated.raw_contents,
				source_provider: this.name,
			};
		};

		return this.execute_with_retry(process_urls);
	}
}
