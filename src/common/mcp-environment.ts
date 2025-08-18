/**
 * MCP Environment Detection and Optimization
 * Detects how the MCP is running and optimizes accordingly
 */

export type MCPTransport = 'stdio' | 'http' | 'sse' | 'unknown';

export interface MCPEnvironment {
	transport: MCPTransport;
	is_on_demand: boolean;
	is_persistent: boolean;
	optimize_for_cold_start: boolean;
	memory_limit_mb: number;
	state_persistence_enabled: boolean;
}

class MCPEnvironmentDetector {
	private environment: MCPEnvironment;

	constructor() {
		this.environment = this.detect_environment();
		this.apply_optimizations();
	}

	private detect_environment(): MCPEnvironment {
		// Detect transport type
		let transport: MCPTransport = 'unknown';
		let is_on_demand = false;
		let is_persistent = false;

		// Check for stdio transport (most common for MCP)
		if (process.stdin.isTTY === false && process.stdout.isTTY === false) {
			transport = 'stdio';
			is_on_demand = true; // stdio typically means on-demand execution
		}

		// Check for HTTP/SSE environment variables or arguments
		if (process.env.MCP_HTTP_PORT || process.argv.includes('--http')) {
			transport = 'http';
			is_persistent = true; // HTTP servers are typically persistent
		}

		if (process.env.MCP_SSE_ENDPOINT || process.argv.includes('--sse')) {
			transport = 'sse';
			is_persistent = true; // SSE connections are typically persistent
		}

		// Override detection with explicit environment variable
		const explicit_transport = process.env.OMNISEARCH_TRANSPORT as MCPTransport;
		if (explicit_transport && ['stdio', 'http', 'sse'].includes(explicit_transport)) {
			transport = explicit_transport;
			is_on_demand = explicit_transport === 'stdio';
			is_persistent = explicit_transport !== 'stdio';
		}

		return {
			transport,
			is_on_demand,
			is_persistent,
			optimize_for_cold_start: is_on_demand,
			memory_limit_mb: is_on_demand ? 50 : 200, // Lower limit for on-demand
			state_persistence_enabled: !is_on_demand || process.env.OMNISEARCH_FORCE_PERSISTENCE === 'true',
		};
	}

	private apply_optimizations(): void {
		if (this.environment.optimize_for_cold_start) {
			// Set environment variables to optimize for cold starts
			process.env.OMNISEARCH_MEMORY_MONITORING = 'true';
			
			// Reduce default history sizes
			if (!process.env.OMNISEARCH_MAX_HISTORY) {
				process.env.OMNISEARCH_MAX_HISTORY = '100';
			}
			
			// Enable aggressive state saving
			if (!process.env.OMNISEARCH_SAVE_THROTTLE_MS) {
				process.env.OMNISEARCH_SAVE_THROTTLE_MS = '1000';
			}
		}

		// Log environment detection (can be disabled)
		if (process.env.OMNISEARCH_LOG_ENVIRONMENT !== 'false') {
			console.error(`MCP Environment: ${this.environment.transport} (${
				this.environment.is_on_demand ? 'on-demand' : 'persistent'
			})`);
		}
	}

	get_environment(): MCPEnvironment {
		return { ...this.environment };
	}

	is_stdio(): boolean {
		return this.environment.transport === 'stdio';
	}

	is_http(): boolean {
		return this.environment.transport === 'http';
	}

	is_sse(): boolean {
		return this.environment.transport === 'sse';
	}

	should_optimize_cold_start(): boolean {
		return this.environment.optimize_for_cold_start;
	}

	should_persist_state(): boolean {
		return this.environment.state_persistence_enabled;
	}

	get_memory_limit(): number {
		return this.environment.memory_limit_mb;
	}
}

// Singleton instance
let environment_detector: MCPEnvironmentDetector | null = null;

export const get_mcp_environment = (): MCPEnvironment => {
	if (!environment_detector) {
		environment_detector = new MCPEnvironmentDetector();
	}
	return environment_detector.get_environment();
};

export const should_persist_state = (): boolean => {
	if (!environment_detector) {
		environment_detector = new MCPEnvironmentDetector();
	}
	return environment_detector.should_persist_state();
};

export const should_optimize_cold_start = (): boolean => {
	if (!environment_detector) {
		environment_detector = new MCPEnvironmentDetector();
	}
	return environment_detector.should_optimize_cold_start();
};