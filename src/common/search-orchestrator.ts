import { BaseSearchParams, SearchProvider, SearchResult, ProviderError, ErrorType } from './types.js';
import { provider_health_manager, ProviderHealth } from './provider-health.js';
import { delay } from './utils.js';
import { provider_config } from '../config/provider-config.js';
import { query_analyzer } from './query-analyzer.js';
import { performance_tracker } from './performance-tracker.js';

export interface UnifiedSearchResult {
	results: SearchResult[];
	provider_used: string;
	fallback_attempts: string[];
	total_time_ms: number;
	success: boolean;
	error?: string;
	query_analysis?: {
		type: string;
		recommended_provider: string;
		confidence: number;
		reasoning: string;
	};
}

export class SearchOrchestrator {
	private search_providers: Map<string, SearchProvider> = new Map();
	private ai_response_providers: Map<string, SearchProvider> = new Map();

	register_search_provider(provider: SearchProvider, is_ai_response = false): void {
		if (is_ai_response) {
			this.ai_response_providers.set(provider.name, provider);
		} else {
			this.search_providers.set(provider.name, provider);
		}
		provider_health_manager.register_provider(provider.name);
	}

	async unified_search(params: BaseSearchParams): Promise<UnifiedSearchResult> {
		const start_time = Date.now();
		const fallback_attempts: string[] = [];
		const fallback_settings = provider_config.get_fallback_settings();
		
		// Analyze the query
		const query_characteristics = query_analyzer.analyze_query(params.query);
		
		// Get available search providers
		let available_providers = provider_health_manager.get_available_providers('search')
			.filter(name => this.search_providers.has(name) && provider_config.is_provider_enabled(name));
		
		// Get intelligent provider recommendation
		const recommendation = query_analyzer.get_recommended_provider(params.query, available_providers);
		
		// Use adaptive ranking based on performance history
		const adaptive_ranking = performance_tracker.get_adaptive_provider_ranking(
			query_characteristics,
			available_providers
		);
		
		// Combine recommendations: prefer query analyzer's choice, then adaptive ranking
		available_providers = this.combine_provider_rankings(
			recommendation,
			adaptive_ranking
		);

		if (available_providers.length === 0) {
			return {
				results: [],
				provider_used: '',
				fallback_attempts,
				total_time_ms: Date.now() - start_time,
				success: false,
				error: 'No search providers available'
			};
		}

		// If fallback is disabled, only try the first provider
		if (!fallback_settings.enabled) {
			const provider_name = available_providers[0];
			const provider = this.search_providers.get(provider_name)!;
			try {
				const results = await this.attempt_search(provider, params);
				provider_health_manager.record_success(provider_name);
				
				return {
					results,
					provider_used: provider_name,
					fallback_attempts,
					total_time_ms: Date.now() - start_time,
					success: true
				};
			} catch (error) {
				fallback_attempts.push(provider_name);
				if (error instanceof ProviderError) {
					provider_health_manager.record_failure(provider_name, error);
				}
				return {
					results: [],
					provider_used: '',
					fallback_attempts,
					total_time_ms: Date.now() - start_time,
					success: false,
					error: `Provider ${provider_name} failed: ${error instanceof Error ? error.message : 'Unknown error'}`
				};
			}
		}

		// Try providers in order
		for (const provider_name of available_providers) {
			const provider = this.search_providers.get(provider_name)!;
			
			try {
				// Small delay between attempts  
				if (fallback_attempts.length > 0 && fallback_settings.enabled) {
					await delay(fallback_settings.delay_ms);
				}
				
				const attempt_start = Date.now();
				const results = await this.attempt_search(provider, params);
				const response_time = Date.now() - attempt_start;
				
				// Record success
				provider_health_manager.record_success(provider_name);
				performance_tracker.record_query_result(
					params.query,
					query_characteristics,
					provider_name,
					true,
					response_time,
					results.length
				);
				
				return {
					results,
					provider_used: provider_name,
					fallback_attempts,
					total_time_ms: Date.now() - start_time,
					success: true,
					query_analysis: {
						type: query_characteristics.query_type,
						recommended_provider: recommendation.provider,
						confidence: recommendation.confidence,
						reasoning: recommendation.reasoning
					}
				};
			} catch (error) {
				fallback_attempts.push(provider_name);
				
				// Record failure
				if (error instanceof ProviderError) {
					provider_health_manager.record_failure(provider_name, error);
					performance_tracker.record_query_result(
						params.query,
						query_characteristics,
						provider_name,
						false,
						Date.now() - start_time,
						0,
						error.type
					);
				}
				
				// If fallback is disabled, stop after first failure
				if (!fallback_settings.enabled) {
					return {
						results: [],
						provider_used: '',
						fallback_attempts,
						total_time_ms: Date.now() - start_time,
						success: false,
						error: `Provider ${provider_name} failed: ${error instanceof Error ? error.message : 'Unknown error'}`
					};
				}
			}
		}


		// All providers failed
		return {
			results: [],
			provider_used: '',
			fallback_attempts,
			total_time_ms: Date.now() - start_time,
			success: false,
			error: `All ${available_providers.length} search providers failed`
		};
	}

	async unified_ai_search(params: BaseSearchParams): Promise<UnifiedSearchResult> {
		const start_time = Date.now();
		const fallback_attempts: string[] = [];
		const fallback_settings = provider_config.get_fallback_settings();
		
		// Get available AI response providers in priority order
		const available_providers = provider_health_manager.get_available_providers('ai_response')
			.filter(name => this.ai_response_providers.has(name));

		if (available_providers.length === 0) {
			return {
				results: [],
				provider_used: '',
				fallback_attempts,
				total_time_ms: Date.now() - start_time,
				success: false,
				error: 'No AI response providers available'
			};
		}

		// Try each provider
		for (const provider_name of available_providers) {
			const provider = this.ai_response_providers.get(provider_name)!;
			
			try {
				// Configurable delay between attempts
				if (fallback_attempts.length > 0) {
					await delay(fallback_settings.delay_ms);
				}
				
				const results = await this.attempt_search(provider, params);
				provider_health_manager.record_success(provider_name);
				
				return {
					results,
					provider_used: provider_name,
					fallback_attempts,
					total_time_ms: Date.now() - start_time,
					success: true
				};
			} catch (error) {
				fallback_attempts.push(provider_name);
				if (error instanceof ProviderError) {
					provider_health_manager.record_failure(provider_name, error);
				}
			}
		}

		// All providers failed
		return {
			results: [],
			provider_used: '',
			fallback_attempts,
			total_time_ms: Date.now() - start_time,
			success: false,
			error: `All ${available_providers.length} AI response providers failed`
		};
	}

	private async attempt_search(provider: SearchProvider, params: BaseSearchParams): Promise<SearchResult[]> {
		// Enhanced retry logic with provider-specific timeouts
		const max_retries = 2;
		let last_error: Error | undefined;

		for (let attempt = 0; attempt <= max_retries; attempt++) {
			try {
				// Add timeout to prevent hanging
				const timeout = 30000; // 30 seconds
				const search_promise = provider.search(params);
				const timeout_promise = new Promise<never>((_, reject) => {
					setTimeout(() => reject(new Error('Search timeout')), timeout);
				});

				const results = await Promise.race([search_promise, timeout_promise]);
				return results;
			} catch (error) {
				last_error = error as Error;
				
				// Don't retry on certain errors
				if (error instanceof ProviderError) {
					if (error.type === ErrorType.RATE_LIMIT || 
						error.type === ErrorType.INVALID_INPUT ||
						error.message.includes('Invalid API key')) {
						throw error;
					}
				}

				// Exponential backoff for retries
				if (attempt < max_retries) {
					const delay_ms = Math.min(1000 * Math.pow(2, attempt), 5000);
					await delay(delay_ms);
				}
			}
		}

		throw last_error || new Error('Unknown error during search');
	}

	get_provider_health(): {
		providers: ProviderHealth[];
		available_search: string[];
		available_ai_response: string[];
	} {
		return {
			providers: provider_health_manager.get_health_status(),
			available_search: provider_health_manager.get_available_providers('search'),
			available_ai_response: provider_health_manager.get_available_providers('ai_response'),
		};
	}

	private combine_provider_rankings(
		recommendation: { provider: string; confidence: number },
		adaptive_ranking: string[]
	): string[] {
		const CONFIDENCE_THRESHOLD = 70;
		
		if (recommendation.provider && recommendation.confidence > CONFIDENCE_THRESHOLD) {
			// High confidence in recommendation, put it first
			return [
				recommendation.provider,
				...adaptive_ranking.filter(p => p !== recommendation.provider)
			];
		} else {
			// Use adaptive ranking
			return adaptive_ranking;
		}
	}

	reset_provider_health(provider_name: string): void {
		provider_health_manager.reset_provider_health(provider_name);
	}
}

// Export singleton instance
export const search_orchestrator = new SearchOrchestrator();