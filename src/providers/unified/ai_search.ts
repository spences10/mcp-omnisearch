import {
	BaseSearchParams,
	ErrorType,
	ProviderError,
	SearchProvider,
	SearchResult,
} from '../../common/types.js';
import { ExaAnswerProvider } from '../ai_response/exa_answer/index.js';
import { KagiFastGPTProvider } from '../ai_response/kagi_fastgpt/index.js';
import { LinkupProvider } from '../ai_response/linkup/index.js';
import { PerplexityProvider } from '../ai_response/perplexity/index.js';

export type AISearchProvider =
	| 'perplexity'
	| 'kagi_fastgpt'
	| 'exa_answer'
	| 'linkup';

export interface UnifiedAISearchParams extends BaseSearchParams {
	provider: AISearchProvider;
}

export class UnifiedAISearchProvider implements SearchProvider {
	name = 'ai_search';
	description =
		'AI-powered search with reasoning. Supports perplexity (real-time + reasoning), kagi_fastgpt (quick answers), exa_answer (semantic AI), linkup (deep agentic search).';

	private providers: Map<AISearchProvider, SearchProvider> =
		new Map();

	constructor() {
		this.providers.set('perplexity', new PerplexityProvider());
		this.providers.set('kagi_fastgpt', new KagiFastGPTProvider());
		this.providers.set('exa_answer', new ExaAnswerProvider());
		this.providers.set('linkup', new LinkupProvider());
	}

	async search(
		params: UnifiedAISearchParams,
	): Promise<SearchResult[]> {
		const { provider, ...searchParams } = params;

		if (!provider) {
			throw new ProviderError(
				ErrorType.INVALID_INPUT,
				'Provider parameter is required',
				this.name,
			);
		}

		const selectedProvider = this.providers.get(provider);

		if (!selectedProvider) {
			throw new ProviderError(
				ErrorType.INVALID_INPUT,
				`Invalid provider: ${provider}. Valid options: ${Array.from(this.providers.keys()).join(', ')}`,
				this.name,
			);
		}

		return selectedProvider.search(searchParams);
	}
}
