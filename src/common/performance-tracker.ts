import { QueryCharacteristics } from './query-analyzer.js';
import { get_state_manager } from './state-manager.js';
import { memory_manager } from './memory-manager.js';

export interface ProviderPerformance {
	provider: string;
	total_requests: number;
	successful_requests: number;
	failed_requests: number;
	average_response_time: number;
	success_rate: number;
	query_type_performance: Record<string, {
		count: number;
		success_rate: number;
		avg_response_time: number;
	}>;
	recent_performance: {
		last_hour: number;
		last_day: number;
		last_week: number;
	};
}

export interface QueryPerformanceRecord {
	query: string;
	characteristics: QueryCharacteristics;
	provider_used: string;
	success: boolean;
	response_time_ms: number;
	result_count: number;
	timestamp: Date;
	error_type?: string;
	user_feedback?: 'good' | 'bad' | 'neutral';
}

class PerformanceTracker {
	private performance_history: QueryPerformanceRecord[] = [];
	private provider_stats: Map<string, ProviderPerformance> = new Map();
	private readonly MAX_HISTORY_SIZE = 1000; // Reduced for MCP usage
	private readonly ROLLING_WINDOW_SIZE = 100; // For calculating recent performance
	private state_manager = get_state_manager();
	private initialized = false;

	constructor() {
		this.load_persisted_state();
		this.register_memory_cleanup();
	}

	private register_memory_cleanup(): void {
		memory_manager.register_cleanup_callback(() => {
			// Keep only recent records for memory efficiency
			if (this.performance_history.length > this.ROLLING_WINDOW_SIZE) {
				this.performance_history = this.performance_history.slice(-this.ROLLING_WINDOW_SIZE);
			}
		});
	}

	private load_persisted_state(): void {
		if (this.initialized) return;
		
		const state = this.state_manager.load_state();
		if (state?.performance_records) {
			this.performance_history = state.performance_records.slice(-this.MAX_HISTORY_SIZE);
			// Rebuild provider stats from history
			this.rebuild_provider_stats();
		}
		this.initialized = true;
	}

	private rebuild_provider_stats(): void {
		this.provider_stats.clear();
		for (const record of this.performance_history) {
			this.update_provider_stats(record.provider_used, record);
		}
	}

	private save_state(): void {
		const current_state = this.state_manager.load_state() || {
			provider_health: {},
			performance_records: [],
			configuration_overrides: {},
			last_updated: new Date().toISOString(),
			version: '1.0'
		};

		current_state.performance_records = this.performance_history.slice(-this.MAX_HISTORY_SIZE);
		this.state_manager.save_state(current_state);
	}

	record_query_result(
		query: string,
		characteristics: QueryCharacteristics,
		provider: string,
		success: boolean,
		response_time_ms: number,
		result_count: number = 0,
		error_type?: string
	): void {
		const record: QueryPerformanceRecord = {
			query,
			characteristics,
			provider_used: provider,
			success,
			response_time_ms,
			result_count,
			timestamp: new Date(),
			error_type
		};

		// Add to history
		this.performance_history.push(record);
		
		// Maintain max history size
		if (this.performance_history.length > this.MAX_HISTORY_SIZE) {
			this.performance_history.shift();
		}

		// Update provider stats
		this.update_provider_stats(provider, record);
		
		// Save state periodically (throttled by state manager)
		this.save_state();
	}

	private update_provider_stats(provider: string, record: QueryPerformanceRecord): void {
		let stats = this.provider_stats.get(provider);
		
		if (!stats) {
			stats = {
				provider,
				total_requests: 0,
				successful_requests: 0,
				failed_requests: 0,
				average_response_time: 0,
				success_rate: 0,
				query_type_performance: {},
				recent_performance: {
					last_hour: 0,
					last_day: 0,
					last_week: 0
				}
			};
			this.provider_stats.set(provider, stats);
		}

		// Update basic counts
		stats.total_requests++;
		if (record.success) {
			stats.successful_requests++;
		} else {
			stats.failed_requests++;
		}

		// Update average response time (using running average)
		stats.average_response_time = 
			(stats.average_response_time * (stats.total_requests - 1) + record.response_time_ms) 
			/ stats.total_requests;

		// Update success rate
		stats.success_rate = stats.successful_requests / stats.total_requests;

		// Update query type performance
		const query_type = record.characteristics.query_type;
		if (!stats.query_type_performance[query_type]) {
			stats.query_type_performance[query_type] = {
				count: 0,
				success_rate: 0,
				avg_response_time: 0
			};
		}

		const type_perf = stats.query_type_performance[query_type];
		type_perf.count++;
		type_perf.avg_response_time = 
			(type_perf.avg_response_time * (type_perf.count - 1) + record.response_time_ms) 
			/ type_perf.count;
		
		// Calculate success rate incrementally to avoid O(n) filtering
		const previous_successes = type_perf.success_rate * (type_perf.count - 1);
		const new_successes = previous_successes + (record.success ? 1 : 0);
		type_perf.success_rate = new_successes / type_perf.count;

		// Update recent performance
		this.update_recent_performance(stats);
	}

	private update_recent_performance(stats: ProviderPerformance): void {
		const now = new Date();
		const hour_ago = new Date(now.getTime() - 60 * 60 * 1000);
		const day_ago = new Date(now.getTime() - 24 * 60 * 60 * 1000);
		const week_ago = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

		const provider_records = this.performance_history.filter(
			r => r.provider_used === stats.provider
		);

		// Last hour
		const hour_records = provider_records.filter(r => r.timestamp > hour_ago);
		stats.recent_performance.last_hour = hour_records.length > 0
			? hour_records.filter(r => r.success).length / hour_records.length
			: stats.success_rate;

		// Last day
		const day_records = provider_records.filter(r => r.timestamp > day_ago);
		stats.recent_performance.last_day = day_records.length > 0
			? day_records.filter(r => r.success).length / day_records.length
			: stats.success_rate;

		// Last week
		const week_records = provider_records.filter(r => r.timestamp > week_ago);
		stats.recent_performance.last_week = week_records.length > 0
			? week_records.filter(r => r.success).length / week_records.length
			: stats.success_rate;
	}

	get_provider_performance(provider: string): ProviderPerformance | null {
		return this.provider_stats.get(provider) || null;
	}

	get_all_provider_performance(): ProviderPerformance[] {
		return Array.from(this.provider_stats.values());
	}

	get_best_provider_for_query_type(
		query_type: string,
		available_providers: string[]
	): string | null {
		let best_provider: string | null = null;
		let best_score = 0;

		for (const provider of available_providers) {
			const stats = this.provider_stats.get(provider);
			if (!stats) continue;

			const type_perf = stats.query_type_performance[query_type];
			if (!type_perf || type_perf.count < 5) continue; // Need minimum data

			// Score based on success rate and response time
			// Weight success rate more heavily (70% success, 30% speed)
			const max_response_time = 30000; // 30 seconds max
			const speed_score = Math.max(0, 1 - (type_perf.avg_response_time / max_response_time));
			const score = (type_perf.success_rate * 0.7) + (speed_score * 0.3);

			if (score > best_score) {
				best_score = score;
				best_provider = provider;
			}
		}

		return best_provider;
	}

	get_adaptive_provider_ranking(
		characteristics: QueryCharacteristics,
		available_providers: string[]
	): string[] {
		const scored_providers: Array<{ provider: string; score: number }> = [];

		for (const provider of available_providers) {
			const stats = this.provider_stats.get(provider);
			if (!stats) {
				// No history, use middle score
				scored_providers.push({ provider, score: 0.5 });
				continue;
			}

			let score = 0;
			let weight_sum = 0;

			// Score based on overall performance (weight: 0.2)
			score += stats.success_rate * 0.2;
			weight_sum += 0.2;

			// Score based on recent performance (weight: 0.3)
			score += stats.recent_performance.last_hour * 0.3;
			weight_sum += 0.3;

			// Score based on query type performance (weight: 0.4)
			const type_perf = stats.query_type_performance[characteristics.query_type];
			if (type_perf && type_perf.count >= 3) {
				score += type_perf.success_rate * 0.4;
				weight_sum += 0.4;
			} else {
				// Use overall performance if no specific data
				score += stats.success_rate * 0.4;
				weight_sum += 0.4;
			}

			// Score based on response time (weight: 0.1)
			const max_response_time = 30000; // 30 seconds max
			const speed_score = Math.max(0, 1 - (stats.average_response_time / max_response_time));
			score += speed_score * 0.1;
			weight_sum += 0.1;

			scored_providers.push({ 
				provider, 
				score: weight_sum > 0 ? score / weight_sum : 0 
			});
		}

		// Sort by score descending
		return scored_providers
			.sort((a, b) => b.score - a.score)
			.map(sp => sp.provider);
	}

	record_user_feedback(query: string, provider: string, feedback: 'good' | 'bad' | 'neutral'): void {
		// Find the most recent matching record
		for (let i = this.performance_history.length - 1; i >= 0; i--) {
			const record = this.performance_history[i];
			if (record.query === query && record.provider_used === provider && !record.user_feedback) {
				record.user_feedback = feedback;
				break;
			}
		}
	}

	get_provider_insights(): {
		best_overall: string | null;
		best_for_speed: string | null;
		most_reliable: string | null;
		trending_up: string[];
		trending_down: string[];
		recommendations: string[];
	} {
		const providers = this.get_all_provider_performance();
		
		if (providers.length === 0) {
			return {
				best_overall: null,
				best_for_speed: null,
				most_reliable: null,
				trending_up: [],
				trending_down: [],
				recommendations: []
			};
		}

		// Best overall (success rate * speed)
		const best_overall = providers.reduce((best, current) => {
			const current_score = current.success_rate * (1 - current.average_response_time / 10000);
			const best_score = best.success_rate * (1 - best.average_response_time / 10000);
			return current_score > best_score ? current : best;
		});

		// Best for speed
		const best_for_speed = providers.reduce((best, current) => 
			current.average_response_time < best.average_response_time ? current : best
		);

		// Most reliable
		const most_reliable = providers.reduce((best, current) =>
			current.success_rate > best.success_rate ? current : best
		);

		// Trending (compare last hour to last week)
		const trending_up: string[] = [];
		const trending_down: string[] = [];
		
		for (const provider of providers) {
			const improvement = provider.recent_performance.last_hour - provider.recent_performance.last_week;
			if (improvement > 0.1) {
				trending_up.push(provider.provider);
			} else if (improvement < -0.1) {
				trending_down.push(provider.provider);
			}
		}

		// Recommendations
		const recommendations: string[] = [];
		
		if (most_reliable.success_rate > 0.95) {
			recommendations.push(`${most_reliable.provider} is extremely reliable (${(most_reliable.success_rate * 100).toFixed(1)}% success rate)`);
		}
		
		if (best_for_speed.average_response_time < 1000) {
			recommendations.push(`${best_for_speed.provider} is very fast (${best_for_speed.average_response_time.toFixed(0)}ms avg)`);
		}
		
		if (trending_up.length > 0) {
			recommendations.push(`${trending_up.join(', ')} showing improved performance recently`);
		}
		
		if (trending_down.length > 0) {
			recommendations.push(`Consider reducing usage of ${trending_down.join(', ')} (declining performance)`);
		}

		return {
			best_overall: best_overall.provider,
			best_for_speed: best_for_speed.provider,
			most_reliable: most_reliable.provider,
			trending_up,
			trending_down,
			recommendations
		};
	}

	export_statistics(): string {
		const insights = this.get_provider_insights();
		const providers = this.get_all_provider_performance();
		
		return JSON.stringify({
			summary: insights,
			provider_details: providers,
			total_queries: this.performance_history.length,
			time_range: {
				oldest: this.performance_history[0]?.timestamp,
				newest: this.performance_history[this.performance_history.length - 1]?.timestamp
			}
		}, null, 2);
	}
}

export const performance_tracker = new PerformanceTracker();