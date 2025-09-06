import { AbstractProcessingProvider } from '../../../common/abstract-processing-provider.js';
import { ProcessingResult } from '../../../common/types.js';
import { config } from '../../../config/env.js';

interface JinaReaderResponse {
	data: {
		content: string;
		title: string;
		timestamp: string;
	};
}

export class JinaReaderProvider extends AbstractProcessingProvider {
	readonly name = 'jina_reader';
	readonly description =
		'Convert any URL to clean, LLM-friendly text using Jina Reader API';

	constructor() {
		super(
			{
				api_key: config.processing.jina_reader.api_key || '',
				base_url: 'https://r.jina.ai',
				timeout: config.processing.jina_reader.timeout,
				auth_type: 'bearer',
			},
			'jina_reader',
			{
				allow_single_url: true,
				allow_multiple_urls: false, // Jina Reader processes one URL at a time
				max_urls: 1,
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
		const single_url = urls[0]; // Only process single URL

		const process_url = async () => {
			const response =
				await this.http_client.post<JinaReaderResponse>(
					'/',
					{ url: single_url },
					this.name,
				);

			if (!response.data.data) {
				throw new Error('Invalid response format from Jina Reader');
			}

			const content = response.data.data.content || '';
			const results = [
				{
					url: single_url,
					content,
					title: response.data.data.title,
					metadata: {
						title: response.data.data.title || '',
						date: response.data.data.timestamp || '',
					},
				},
			];

			const aggregated = this.aggregate_content(results);
			const metadata = this.calculate_metadata(
				urls,
				validated_depth,
				{
					total_word_count: aggregated.total_word_count,
				},
			);

			return {
				content: aggregated.combined_content,
				metadata,
				raw_contents: aggregated.raw_contents,
				source_provider: this.name,
			};
		};

		return this.execute_with_retry(process_url);
	}
}
