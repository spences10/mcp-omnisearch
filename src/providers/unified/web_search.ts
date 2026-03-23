import {
	BaseSearchParams,
	ErrorType,
	ProviderError,
	SearchProvider,
	SearchResult,
} from '../../common/types.js';
import { BraveSearchProvider } from '../search/brave/index.js';
import { ExaSearchProvider } from '../search/exa/index.js';
import { KagiSearchProvider } from '../search/kagi/index.js';
import { LinkupSearchProvider } from '../search/linkup/index.js';
import { TavilySearchProvider } from '../search/tavily/index.js';

export type WebSearchProvider = 'tavily' | 'brave' | 'kagi' | 'exa' | 'linkup';

export interface UnifiedWebSearchParams extends BaseSearchParams {
	provider: WebSearchProvider;
}

export class UnifiedWebSearchProvider implements SearchProvider {
	name = 'web_search';
	description =
		'Search the web. Providers: tavily (factual/citations), brave (privacy/operators), kagi (quality/operators), exa (AI-semantic), linkup (agentic/factuality). Brave/Kagi support query operators like site:, filetype:, lang:, etc.';

	private providers: Map<WebSearchProvider, SearchProvider> =
		new Map();

	constructor() {
		this.providers.set('tavily', new TavilySearchProvider());
		this.providers.set('brave', new BraveSearchProvider());
		this.providers.set('kagi', new KagiSearchProvider());
		this.providers.set('exa', new ExaSearchProvider());
		this.providers.set('linkup', new LinkupSearchProvider());
	}

	async search(
		params: UnifiedWebSearchParams,
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
