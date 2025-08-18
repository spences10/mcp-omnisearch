import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { ProviderHealth } from './provider-health.js';
import { QueryPerformanceRecord } from './performance-tracker.js';
import { SearchConfiguration } from '../config/provider-config.js';
import { should_persist_state, should_optimize_cold_start } from './mcp-environment.js';

export interface PersistedState {
	provider_health: Record<string, ProviderHealth>;
	performance_records: QueryPerformanceRecord[];
	configuration_overrides: Partial<SearchConfiguration>;
	last_updated: string;
	version: string;
}

export class StateManager {
	private state_file: string;
	private max_performance_records: number = 1000; // Limit for MCP
	private save_throttle_ms: number = 5000; // Throttle saves
	private last_save: number = 0;
	private pending_save: NodeJS.Timeout | null = null;

	constructor() {
		// Skip state file setup if persistence is disabled
		if (!should_persist_state()) {
			this.state_file = '';
			return;
		}

		// Use OS temp directory or current working directory
		const state_dir = process.env.OMNISEARCH_STATE_DIR || 
			process.env.TMPDIR || 
			process.env.TEMP || 
			process.cwd();
		
		// Ensure directory exists
		if (!existsSync(state_dir)) {
			try {
				mkdirSync(state_dir, { recursive: true });
			} catch (error) {
				console.warn(`Could not create state directory: ${state_dir}`);
			}
		}
		
		this.state_file = join(state_dir, '.omnisearch-state.json');
		
		// Optimize throttling for environment
		if (should_optimize_cold_start()) {
			this.save_throttle_ms = parseInt(process.env.OMNISEARCH_SAVE_THROTTLE_MS || '1000', 10);
			this.max_performance_records = parseInt(process.env.OMNISEARCH_MAX_HISTORY || '100', 10);
		}
	}

	load_state(): PersistedState | null {
		// Return null if persistence is disabled
		if (!should_persist_state() || !this.state_file) {
			return null;
		}
		
		try {
			if (!existsSync(this.state_file)) {
				return null;
			}

			const data = readFileSync(this.state_file, 'utf-8');
			const state = JSON.parse(data) as PersistedState;
			
			// Validate state version compatibility
			if (!state.version || state.version !== '1.0') {
				console.warn('State file version mismatch, starting fresh');
				return null;
			}

			// Limit performance records for memory efficiency
			if (state.performance_records && state.performance_records.length > this.max_performance_records) {
				state.performance_records = state.performance_records
					.slice(-this.max_performance_records)
					.map(record => ({
						...record,
						timestamp: new Date(record.timestamp)
					}));
			} else if (state.performance_records) {
				// Convert timestamp strings back to Date objects
				state.performance_records = state.performance_records.map(record => ({
					...record,
					timestamp: new Date(record.timestamp)
				}));
			}

			// Convert date strings back to Date objects in provider health
			if (state.provider_health) {
				for (const [name, health] of Object.entries(state.provider_health)) {
					if (health.last_success) {
						health.last_success = new Date(health.last_success);
					}
					if (health.rate_limited_until) {
						health.rate_limited_until = new Date(health.rate_limited_until);
					}
					if (health.circuit_breaker_open_until) {
						health.circuit_breaker_open_until = new Date(health.circuit_breaker_open_until);
					}
				}
			}

			console.log(`Loaded state from ${this.state_file}`);
			return state;
		} catch (error) {
			console.warn(`Could not load state: ${error instanceof Error ? error.message : 'Unknown error'}`);
			return null;
		}
	}

	save_state(state: PersistedState): void {
		// Skip saving if persistence is disabled
		if (!should_persist_state() || !this.state_file) {
			return;
		}
		
		// Throttle saves to avoid excessive I/O in high-frequency scenarios
		const now = Date.now();
		if (now - this.last_save < this.save_throttle_ms) {
			// Schedule a delayed save
			if (this.pending_save) {
				clearTimeout(this.pending_save);
			}
			this.pending_save = setTimeout(() => {
				this.immediate_save(state);
			}, this.save_throttle_ms);
			return;
		}

		this.immediate_save(state);
	}

	private immediate_save(state: PersistedState): void {
		try {
			// Limit performance records before saving
			const limited_state: PersistedState = {
				...state,
				performance_records: state.performance_records?.slice(-this.max_performance_records) || [],
				last_updated: new Date().toISOString(),
				version: '1.0'
			};

			writeFileSync(this.state_file, JSON.stringify(limited_state, null, 2));
			this.last_save = Date.now();
			
			if (this.pending_save) {
				clearTimeout(this.pending_save);
				this.pending_save = null;
			}
		} catch (error) {
			console.warn(`Could not save state: ${error instanceof Error ? error.message : 'Unknown error'}`);
		}
	}

	clear_state(): void {
		try {
			if (existsSync(this.state_file)) {
				// Don't delete, just overwrite with empty state
				const empty_state: PersistedState = {
					provider_health: {},
					performance_records: [],
					configuration_overrides: {},
					last_updated: new Date().toISOString(),
					version: '1.0'
				};
				writeFileSync(this.state_file, JSON.stringify(empty_state, null, 2));
			}
		} catch (error) {
			console.warn(`Could not clear state: ${error instanceof Error ? error.message : 'Unknown error'}`);
		}
	}

	get_state_file_path(): string {
		return this.state_file;
	}
}

// Create singleton but allow override for testing
let state_manager_instance: StateManager | null = null;

export const get_state_manager = (): StateManager => {
	if (!state_manager_instance) {
		state_manager_instance = new StateManager();
	}
	return state_manager_instance;
};

export const set_state_manager = (manager: StateManager): void => {
	state_manager_instance = manager;
};