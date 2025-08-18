import { get_state_manager } from '../common/state-manager.js';

export interface ProviderConfiguration {
	enabled: boolean;
	priority: number;
	preferred_for?: string[];
	max_retries?: number;
	timeout?: number;
}

export type ProviderMode = 'direct' | 'unified';

export interface SearchConfiguration {
	mode: ProviderMode;
	providers: {
		[key: string]: ProviderConfiguration;
	};
	fallback_enabled: boolean;
	fallback_delay_ms: number;
	circuit_breaker_threshold: number;
	circuit_breaker_timeout_ms: number;
}

export const DEFAULT_SEARCH_CONFIG: SearchConfiguration = {
	mode: 'direct', // Default to direct mode for backward compatibility
	providers: {
		tavily: {
			enabled: true,
			priority: 1,
			preferred_for: ['factual', 'research', 'academic', 'scientific'],
			max_retries: 2,
			timeout: 30000,
		},
		kagi: {
			enabled: true,
			priority: 2,
			preferred_for: ['technical', 'documentation', 'privacy'],
			max_retries: 2,
			timeout: 30000,
		},
		brave: {
			enabled: true,
			priority: 3,
			preferred_for: ['general', 'privacy', 'technical'],
			max_retries: 2,
			timeout: 30000,
		},
		perplexity: {
			enabled: true,
			priority: 1,
			preferred_for: ['comprehensive', 'ai', 'analysis'],
			max_retries: 2,
			timeout: 45000,
		},
		kagi_fastgpt: {
			enabled: true,
			priority: 2,
			preferred_for: ['quick', 'summary', 'ai'],
			max_retries: 2,
			timeout: 45000,
		},
	},
	fallback_enabled: true,
	fallback_delay_ms: 500,
	circuit_breaker_threshold: 3,
	circuit_breaker_timeout_ms: 5 * 60 * 1000, // 5 minutes
};

class ProviderConfigManager {
	private config: SearchConfiguration = DEFAULT_SEARCH_CONFIG;
	private state_manager = get_state_manager();

	constructor() {
		this.load_env_config();
		this.load_persisted_overrides();
	}

	private load_persisted_overrides(): void {
		const state = this.state_manager.load_state();
		if (state?.configuration_overrides) {
			// Apply persisted configuration overrides
			this.config = { ...this.config, ...state.configuration_overrides };
		}
	}

	private save_overrides(): void {
		const current_state = this.state_manager.load_state() || {
			provider_health: {},
			performance_records: [],
			configuration_overrides: {},
			last_updated: new Date().toISOString(),
			version: '1.0'
		};

		// Only save overrides that differ from defaults
		const overrides: Partial<SearchConfiguration> = {};
		if (this.config.mode !== DEFAULT_SEARCH_CONFIG.mode) {
			overrides.mode = this.config.mode;
		}
		if (this.config.fallback_enabled !== DEFAULT_SEARCH_CONFIG.fallback_enabled) {
			overrides.fallback_enabled = this.config.fallback_enabled;
		}
		// Add other fields that can be overridden...

		current_state.configuration_overrides = overrides;
		this.state_manager.save_state(current_state);
	}

	private load_env_config(): void {
		// Load mode configuration
		const mode = process.env.OMNISEARCH_MODE;
		if (mode === 'unified' || mode === 'direct') {
			this.config.mode = mode;
		} else if (mode && mode !== '') {
			console.warn(`Invalid OMNISEARCH_MODE: ${mode}. Using default: direct`);
		}

		// Load provider order from environment variables
		const provider_order = process.env.OMNISEARCH_PROVIDER_ORDER;
		if (provider_order) {
			const providers = provider_order.split(',').map(p => p.trim().toLowerCase());
			providers.forEach((provider, index) => {
				if (this.config.providers[provider]) {
					this.config.providers[provider].priority = index + 1;
				}
			});
		}

		// Load disabled providers
		const disabled_providers = process.env.OMNISEARCH_DISABLED_PROVIDERS;
		if (disabled_providers) {
			const providers = disabled_providers.split(',').map(p => p.trim().toLowerCase());
			providers.forEach(provider => {
				if (this.config.providers[provider]) {
					this.config.providers[provider].enabled = false;
				}
			});
		}

		// Load AI provider order
		const ai_provider_order = process.env.OMNISEARCH_AI_PROVIDER_ORDER;
		if (ai_provider_order) {
			const providers = ai_provider_order.split(',').map(p => p.trim().toLowerCase());
			providers.forEach((provider, index) => {
				if (this.config.providers[provider]) {
					this.config.providers[provider].priority = index + 1;
				}
			});
		}

		// Load fallback settings
		if (process.env.OMNISEARCH_FALLBACK_ENABLED !== undefined) {
			this.config.fallback_enabled = process.env.OMNISEARCH_FALLBACK_ENABLED.toLowerCase() === 'true';
		}

		if (process.env.OMNISEARCH_FALLBACK_DELAY_MS) {
			const delay = parseInt(process.env.OMNISEARCH_FALLBACK_DELAY_MS, 10);
			if (!isNaN(delay) && delay >= 0 && delay <= 10000) {
				this.config.fallback_delay_ms = delay;
			} else {
				console.warn(`Invalid OMNISEARCH_FALLBACK_DELAY_MS: ${process.env.OMNISEARCH_FALLBACK_DELAY_MS}. Using default: ${this.config.fallback_delay_ms}`);
			}
		}

		if (process.env.OMNISEARCH_CIRCUIT_BREAKER_THRESHOLD) {
			const threshold = parseInt(process.env.OMNISEARCH_CIRCUIT_BREAKER_THRESHOLD, 10);
			if (!isNaN(threshold) && threshold >= 1 && threshold <= 20) {
				this.config.circuit_breaker_threshold = threshold;
			} else {
				console.warn(`Invalid OMNISEARCH_CIRCUIT_BREAKER_THRESHOLD: ${process.env.OMNISEARCH_CIRCUIT_BREAKER_THRESHOLD}. Using default: ${this.config.circuit_breaker_threshold}`);
			}
		}

		if (process.env.OMNISEARCH_CIRCUIT_BREAKER_TIMEOUT_MS) {
			const timeout = parseInt(process.env.OMNISEARCH_CIRCUIT_BREAKER_TIMEOUT_MS, 10);
			if (!isNaN(timeout) && timeout >= 10000 && timeout <= 3600000) { // 10 seconds to 1 hour
				this.config.circuit_breaker_timeout_ms = timeout;
			} else {
				console.warn(`Invalid OMNISEARCH_CIRCUIT_BREAKER_TIMEOUT_MS: ${process.env.OMNISEARCH_CIRCUIT_BREAKER_TIMEOUT_MS}. Using default: ${this.config.circuit_breaker_timeout_ms}`);
			}
		}
	}

	get_provider_config(provider: string): ProviderConfiguration | undefined {
		return this.config.providers[provider];
	}

	is_provider_enabled(provider: string): boolean {
		const config = this.config.providers[provider];
		return config ? config.enabled : false;
	}

	get_providers_by_priority(category: 'search' | 'ai_response'): string[] {
		const ai_providers = ['perplexity', 'kagi_fastgpt'];
		const search_providers = ['tavily', 'kagi', 'brave'];
		
		const relevant_providers = category === 'ai_response' ? ai_providers : search_providers;
		
		return relevant_providers
			.filter(name => this.is_provider_enabled(name))
			.sort((a, b) => {
				const priority_a = this.config.providers[a]?.priority || 999;
				const priority_b = this.config.providers[b]?.priority || 999;
				return priority_a - priority_b;
			});
	}

	get_preferred_provider_for_query(query: string, available_providers: string[]): string | null {
		if (available_providers.length === 0) return null;

		const query_lower = query.toLowerCase();
		
		// Check for query-specific preferences
		for (const provider_name of available_providers) {
			const config = this.config.providers[provider_name];
			if (config?.preferred_for) {
				for (const keyword of config.preferred_for) {
					if (query_lower.includes(keyword)) {
						return provider_name;
					}
				}
			}
		}

		// Return highest priority available provider
		return available_providers[0];
	}

	update_provider_config(provider: string, config: Partial<ProviderConfiguration>): void {
		if (this.config.providers[provider]) {
			this.config.providers[provider] = {
				...this.config.providers[provider],
				...config,
			};
		}
	}

	set_provider_order(providers: string[], category: 'search' | 'ai_response' = 'search'): void {
		providers.forEach((provider, index) => {
			if (this.config.providers[provider]) {
				this.config.providers[provider].priority = index + 1;
			}
		});
	}

	get_config(): SearchConfiguration {
		return { ...this.config };
	}

	get_fallback_settings() {
		return {
			enabled: this.config.fallback_enabled,
			delay_ms: this.config.fallback_delay_ms,
			circuit_breaker_threshold: this.config.circuit_breaker_threshold,
			circuit_breaker_timeout_ms: this.config.circuit_breaker_timeout_ms,
		};
	}

	get_mode(): ProviderMode {
		return this.config.mode;
	}

	set_mode(mode: ProviderMode): void {
		this.config.mode = mode;
		this.save_overrides();
	}

	is_unified_mode(): boolean {
		return this.config.mode === 'unified';
	}

	is_direct_mode(): boolean {
		return this.config.mode === 'direct';
	}
}

export const provider_config = new ProviderConfigManager();