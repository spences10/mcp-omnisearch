import { ErrorType, ProviderError } from './types.js';
import { provider_config } from '../config/provider-config.js';
import { get_state_manager } from './state-manager.js';

export interface ProviderHealth {
	name: string;
	available: boolean;
	last_error?: ProviderError;
	last_success?: Date;
	failure_count: number;
	rate_limited_until?: Date;
	circuit_breaker_open: boolean;
	circuit_breaker_open_until?: Date;
}

class ProviderHealthManager {
	private health_status: Map<string, ProviderHealth> = new Map();
	private readonly FAILURE_RESET_TIME = 30 * 60 * 1000; // 30 minutes
	private state_manager = get_state_manager();
	private initialized = false;

	constructor() {
		this.load_persisted_state();
	}

	private load_persisted_state(): void {
		if (this.initialized) return;
		
		const state = this.state_manager.load_state();
		if (state?.provider_health) {
			for (const [name, health] of Object.entries(state.provider_health)) {
				this.health_status.set(name, { ...health });
			}
		}
		this.initialized = true;
	}

	private save_state(): void {
		const current_state = this.state_manager.load_state() || {
			provider_health: {},
			performance_records: [],
			configuration_overrides: {},
			last_updated: new Date().toISOString(),
			version: '1.0'
		};

		const health_data: Record<string, ProviderHealth> = {};
		for (const [name, health] of this.health_status.entries()) {
			health_data[name] = { ...health };
		}

		current_state.provider_health = health_data;
		this.state_manager.save_state(current_state);
	}

	register_provider(name: string): void {
		if (!this.health_status.has(name)) {
			this.health_status.set(name, {
				name,
				available: true,
				failure_count: 0,
				circuit_breaker_open: false,
			});
		}
	}

	record_success(provider_name: string): void {
		const health = this.health_status.get(provider_name);
		if (health) {
			health.available = true;
			health.last_success = new Date();
			health.failure_count = 0;
			health.circuit_breaker_open = false;
			health.circuit_breaker_open_until = undefined;
			health.rate_limited_until = undefined;
			health.last_error = undefined;
			this.save_state();
		}
	}

	record_failure(provider_name: string, error: ProviderError): void {
		const health = this.health_status.get(provider_name);
		if (!health) return;

		health.last_error = error;
		health.failure_count++;

		switch (error.type) {
			case ErrorType.RATE_LIMIT:
				const reset_time = error.details?.reset_time;
				health.rate_limited_until = reset_time || new Date(Date.now() + 60 * 60 * 1000); // 1 hour default
				health.available = false;
				break;
				
			case ErrorType.CREDIT_EXHAUSTED:
			case ErrorType.QUOTA_EXCEEDED:
				health.rate_limited_until = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours for credit issues
				health.available = false;
				break;
				
			case ErrorType.AUTHENTICATION_ERROR:
				health.available = false;
				break;
				
			case ErrorType.API_ERROR:
				// Fallback for legacy error detection
				if (error.message.includes('credit') || error.message.includes('quota') || error.message.includes('limit')) {
					health.rate_limited_until = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours for credit issues
					health.available = false;
				} else if (error.message.includes('Invalid API key') || error.message.includes('Unauthorized')) {
					health.available = false;
				}
				break;
				
			case ErrorType.PROVIDER_ERROR:
				const settings = provider_config.get_fallback_settings();
				if (health.failure_count >= settings.circuit_breaker_threshold) {
					health.circuit_breaker_open = true;
					health.circuit_breaker_open_until = new Date(Date.now() + settings.circuit_breaker_timeout_ms);
					health.available = false;
				}
				break;
		}
		
		this.save_state();
	}

	is_provider_available(provider_name: string): boolean {
		const health = this.health_status.get(provider_name);
		if (!health) return false;

		const now = new Date();

		// Check if rate limit has expired
		if (health.rate_limited_until && now > health.rate_limited_until) {
			health.rate_limited_until = undefined;
			health.available = true;
		}

		// Check if circuit breaker timeout has expired
		if (health.circuit_breaker_open_until && now > health.circuit_breaker_open_until) {
			health.circuit_breaker_open = false;
			health.circuit_breaker_open_until = undefined;
			health.failure_count = 0;
			health.available = true;
		}

		// Reset failures if provider has been successful recently
		if (health.last_success && (now.getTime() - health.last_success.getTime()) < this.FAILURE_RESET_TIME) {
			// If we had a recent success, gradually reduce failure count
			if (health.failure_count > 0) {
				health.failure_count = Math.floor(health.failure_count * 0.5);
			}
		}

		return health.available && !health.circuit_breaker_open && (!health.rate_limited_until || now > health.rate_limited_until);
	}

	get_available_providers(category: 'search' | 'ai_response' | 'processing' | 'enhancement'): string[] {
		// Get configured provider order
		const configured_providers = provider_config.get_providers_by_priority(
			category as 'search' | 'ai_response'
		);
		
		// Filter by availability and enabled status
		return configured_providers.filter(name => 
			this.is_provider_available(name) && 
			provider_config.is_provider_enabled(name)
		);
	}

	get_preferred_provider(query: string, available_providers: string[]): string | null {
		return provider_config.get_preferred_provider_for_query(query, available_providers);
	}

	get_health_status(): ProviderHealth[] {
		return Array.from(this.health_status.values());
	}

	reset_provider_health(provider_name: string): void {
		const health = this.health_status.get(provider_name);
		if (health) {
			health.available = true;
			health.failure_count = 0;
			health.circuit_breaker_open = false;
			health.circuit_breaker_open_until = undefined;
			health.rate_limited_until = undefined;
			health.last_error = undefined;
			this.save_state();
		}
	}
}

export const provider_health_manager = new ProviderHealthManager();