/**
 * Memory management utilities for MCP on-demand execution
 * Helps prevent memory leaks and optimize resource usage
 */

export class MemoryManager {
	private static instance: MemoryManager | null = null;
	private cleanup_callbacks: (() => void)[] = [];
	private memory_check_interval: NodeJS.Timeout | null = null;
	private readonly MEMORY_CHECK_INTERVAL = 30000; // 30 seconds
	private readonly MAX_MEMORY_MB = 100; // Conservative limit for MCP

	private constructor() {
		this.start_memory_monitoring();
		this.register_cleanup_handlers();
	}

	static get_instance(): MemoryManager {
		if (!MemoryManager.instance) {
			MemoryManager.instance = new MemoryManager();
		}
		return MemoryManager.instance;
	}

	private start_memory_monitoring(): void {
		// Only monitor in development or when explicitly enabled
		if (process.env.NODE_ENV === 'development' || process.env.OMNISEARCH_MEMORY_MONITORING === 'true') {
			this.memory_check_interval = setInterval(() => {
				this.check_memory_usage();
			}, this.MEMORY_CHECK_INTERVAL);
		}
	}

	private check_memory_usage(): void {
		const usage = process.memoryUsage();
		const heap_mb = usage.heapUsed / 1024 / 1024;
		
		if (heap_mb > this.MAX_MEMORY_MB) {
			console.warn(`High memory usage detected: ${heap_mb.toFixed(2)}MB. Running cleanup...`);
			this.run_cleanup();
			
			// Force garbage collection if available
			if (global.gc) {
				global.gc();
			}
		}
	}

	register_cleanup_callback(callback: () => void): void {
		this.cleanup_callbacks.push(callback);
	}

	run_cleanup(): void {
		for (const callback of this.cleanup_callbacks) {
			try {
				callback();
			} catch (error) {
				console.warn('Error during cleanup:', error);
			}
		}
	}

	private register_cleanup_handlers(): void {
		// Cleanup on process exit
		process.on('exit', () => {
			this.cleanup();
		});

		// Cleanup on SIGINT (Ctrl+C)
		process.on('SIGINT', () => {
			this.cleanup();
			process.exit(0);
		});

		// Cleanup on SIGTERM
		process.on('SIGTERM', () => {
			this.cleanup();
			process.exit(0);
		});
	}

	private cleanup(): void {
		if (this.memory_check_interval) {
			clearInterval(this.memory_check_interval);
			this.memory_check_interval = null;
		}
		
		this.run_cleanup();
		MemoryManager.instance = null;
	}

	get_memory_stats(): {
		heap_used_mb: number;
		heap_total_mb: number;
		external_mb: number;
		rss_mb: number;
	} {
		const usage = process.memoryUsage();
		return {
			heap_used_mb: Math.round(usage.heapUsed / 1024 / 1024 * 100) / 100,
			heap_total_mb: Math.round(usage.heapTotal / 1024 / 1024 * 100) / 100,
			external_mb: Math.round(usage.external / 1024 / 1024 * 100) / 100,
			rss_mb: Math.round(usage.rss / 1024 / 1024 * 100) / 100,
		};
	}
}

// Initialize memory manager
export const memory_manager = MemoryManager.get_instance();