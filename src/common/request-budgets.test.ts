import { describe, expect, it, vi } from 'vitest';
import {
	DEFAULT_ESTIMATED_COST_USD,
	DEFAULT_MAX_PROVIDERS,
	DEFAULT_TIMEOUT_SECONDS,
	estimated_provider_cost_usd,
	plan_and_run,
	plan_request_budgets,
	run_with_request_timeout,
	type RequestBudgetPlan,
} from './request-budgets.js';
import { ErrorType } from './types.js';

const multi_provider_candidates = [
	{ id: 'brave', estimated_cost_usd: 0.005 },
	{ id: 'tavily', estimated_cost_usd: 0.008 },
	{ id: 'kagi', estimated_cost_usd: 0.01 },
	{ id: 'exa', estimated_cost_usd: 0.007 },
	{ id: 'kagi_enrichment', estimated_cost_usd: 0.01 },
];

describe('estimated_provider_cost_usd', () => {
	it('returns known search and processing estimates', () => {
		expect(estimated_provider_cost_usd('brave')).toBe(0.005);
		expect(estimated_provider_cost_usd('tavily')).toBe(0.008);
		expect(estimated_provider_cost_usd('github')).toBe(0);
		expect(estimated_provider_cost_usd('firecrawl', 'crawl')).toBe(
			0.05,
		);
		expect(estimated_provider_cost_usd('tavily', 'extract')).toBe(
			0.01,
		);
	});

	it('falls back to a conservative default for unknown providers', () => {
		expect(estimated_provider_cost_usd('unknown')).toBe(
			DEFAULT_ESTIMATED_COST_USD,
		);
		expect(estimated_provider_cost_usd('firecrawl', 'other')).toBe(
			DEFAULT_ESTIMATED_COST_USD,
		);
	});
});

describe('plan_request_budgets', () => {
	it('rejects an empty candidate list before any work', () => {
		expect(() =>
			plan_request_budgets({
				tool: 'web_search',
				candidates: [],
			}),
		).toThrow(
			expect.objectContaining({
				type: ErrorType.INVALID_INPUT,
				provider: 'web_search',
				message: 'Request plan has no providers',
			}),
		);
	});

	it('treats a single-provider plan as a no-op for all knobs', () => {
		const plan = plan_request_budgets({
			tool: 'web_search',
			candidates: [{ id: 'brave', estimated_cost_usd: 0.005 }],
			max_providers: 1,
			timeout_seconds: 1,
			budget_usd: 0,
		});

		expect(plan).toEqual({
			tool: 'web_search',
			providers: [{ id: 'brave', estimated_cost_usd: 0.005 }],
			estimated_cost_usd: 0.005,
			applied: false,
		});
		expect(plan.timeout_ms).toBeUndefined();
	});

	it('caps multi-provider plans at max_providers or the default of 3', () => {
		const default_plan = plan_request_budgets({
			tool: 'web_search',
			candidates: multi_provider_candidates,
		});
		expect(
			default_plan.providers.map((provider) => provider.id),
		).toEqual(['brave', 'tavily', 'kagi']);
		expect(default_plan.providers).toHaveLength(
			DEFAULT_MAX_PROVIDERS,
		);

		const capped = plan_request_budgets({
			tool: 'web_search',
			candidates: multi_provider_candidates,
			max_providers: 2,
		});
		expect(capped.providers.map((provider) => provider.id)).toEqual([
			'brave',
			'tavily',
		]);
		expect(capped.estimated_cost_usd).toBe(0.013);
		expect(capped.applied).toBe(true);
	});

	it('applies the default whole-call timeout only to multi-provider plans', () => {
		const plan = plan_request_budgets({
			tool: 'web_search',
			candidates: multi_provider_candidates.slice(0, 2),
		});

		expect(plan.timeout_ms).toBe(DEFAULT_TIMEOUT_SECONDS * 1000);

		const custom = plan_request_budgets({
			tool: 'web_search',
			candidates: multi_provider_candidates.slice(0, 2),
			timeout_seconds: 8,
		});
		expect(custom.timeout_ms).toBe(8000);
	});

	it('rejects a multi-provider plan that cannot fit budget_usd', () => {
		expect(() =>
			plan_request_budgets({
				tool: 'web_search',
				candidates: multi_provider_candidates.slice(0, 2),
				budget_usd: 0.01,
			}),
		).toThrow(
			expect.objectContaining({
				type: ErrorType.INVALID_INPUT,
				provider: 'web_search',
				details: expect.objectContaining({
					retryable: false,
					estimated_cost_usd: 0.013,
					budget_usd: 0.01,
					providers: ['brave', 'tavily'],
				}),
			}),
		);
	});

	it('allows a multi-provider plan that fits the USD budget exactly', () => {
		const plan = plan_request_budgets({
			tool: 'web_search',
			candidates: [
				{ id: 'brave', estimated_cost_usd: 0.005 },
				{ id: 'exa', estimated_cost_usd: 0.007 },
			],
			budget_usd: 0.012,
		});

		expect(plan.estimated_cost_usd).toBe(0.012);
		expect(plan.applied).toBe(true);
	});
});

describe('run_with_request_timeout', () => {
	it('does not wrap single-provider no-op plans', async () => {
		const work = vi.fn().mockResolvedValue('ok');
		const plan: RequestBudgetPlan = {
			tool: 'web_search',
			providers: [{ id: 'brave', estimated_cost_usd: 0.005 }],
			estimated_cost_usd: 0.005,
			applied: false,
		};

		await expect(run_with_request_timeout(plan, work)).resolves.toBe(
			'ok',
		);
		expect(work).toHaveBeenCalledWith();
	});

	it('times out multi-provider work and cancels the rest', async () => {
		const completed: string[] = [];
		const plan: RequestBudgetPlan = {
			tool: 'web_search',
			providers: [
				{ id: 'brave', estimated_cost_usd: 0.005 },
				{ id: 'tavily', estimated_cost_usd: 0.008 },
			],
			estimated_cost_usd: 0.013,
			timeout_ms: 40,
			applied: true,
		};

		const sleep = (ms: number, signal?: AbortSignal) =>
			new Promise<void>((resolve, reject) => {
				const timer = setTimeout(resolve, ms);
				signal?.addEventListener(
					'abort',
					() => {
						clearTimeout(timer);
						reject(new DOMException('Aborted', 'AbortError'));
					},
					{ once: true },
				);
			});

		await expect(
			run_with_request_timeout(plan, async (signal) => {
				const run = async (id: string, delay: number) => {
					await sleep(delay, signal);
					completed.push(id);
					return id;
				};

				return Promise.all([run('brave', 10), run('tavily', 200)]);
			}),
		).rejects.toMatchObject({
			type: ErrorType.TIMEOUT,
			provider: 'web_search',
			details: { retryable: true },
		});

		expect(completed).not.toContain('tavily');
	});
});

describe('plan_and_run', () => {
	it('does not call work when a multi-provider budget is impossible', async () => {
		const work = vi.fn();

		await expect(
			plan_and_run(
				'web_search',
				multi_provider_candidates.slice(0, 2),
				{ budget_usd: 0.001 },
				work,
			),
		).rejects.toMatchObject({
			type: ErrorType.INVALID_INPUT,
			message: expect.stringContaining('Request budget exceeded'),
		});
		expect(work).not.toHaveBeenCalled();
	});

	it('runs single-provider work even with a zero USD budget', async () => {
		const work = vi.fn().mockResolvedValue(['hit']);

		await expect(
			plan_and_run(
				'web_search',
				[{ id: 'brave', estimated_cost_usd: 0.005 }],
				{ budget_usd: 0, timeout_seconds: 1, max_providers: 1 },
				work,
			),
		).resolves.toEqual(['hit']);
		expect(work).toHaveBeenCalledTimes(1);
	});
});
