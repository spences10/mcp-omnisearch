import { ErrorType, ProviderError } from './types.js';

// Request-level provider, time, and estimated-cost budgets.
// Single-provider plans ignore these knobs so the default path
// stays a cheap no-op. Multi-provider callers share this planner
// so impossible USD plans fail before work.

export const DEFAULT_MAX_PROVIDERS = 3;
export const DEFAULT_TIMEOUT_SECONDS = 20;
export const DEFAULT_ESTIMATED_COST_USD = 0.01;

const ESTIMATED_COST_USD: Record<string, number> = {
	brave: 0.005,
	tavily: 0.008,
	kagi: 0.01,
	exa: 0.007,
	kagi_enrichment: 0.01,
	github: 0,
	kagi_fastgpt: 0.01,
	exa_answer: 0.01,
	linkup: 0.012,
	'tavily:extract': 0.01,
	'kagi:summarize': 0.01,
	'firecrawl:scrape': 0.01,
	'firecrawl:crawl': 0.05,
	'firecrawl:map': 0.01,
	'firecrawl:extract': 0.02,
	'firecrawl:actions': 0.02,
	'exa:contents': 0.005,
	'exa:similar': 0.005,
};

export interface PlannedProvider {
	id: string;
	estimated_cost_usd: number;
}

export interface RequestBudgetInput {
	max_providers?: number;
	timeout_seconds?: number;
	budget_usd?: number;
}

export interface RequestBudgetPlan {
	tool: string;
	providers: PlannedProvider[];
	estimated_cost_usd: number;
	timeout_ms?: number;
	applied: boolean;
}

const round_usd = (value: number) =>
	Math.round(value * 1_000_000) / 1_000_000;

const is_abort_error = (error: unknown) =>
	error instanceof Error && error.name === 'AbortError';

export const estimated_provider_cost_usd = (
	provider: string,
	mode?: string,
): number => {
	if (mode) {
		const keyed = ESTIMATED_COST_USD[`${provider}:${mode}`];
		if (keyed !== undefined) return keyed;
	}

	return ESTIMATED_COST_USD[provider] ?? DEFAULT_ESTIMATED_COST_USD;
};

const request_timeout_error = (plan: RequestBudgetPlan) =>
	new ProviderError(
		ErrorType.TIMEOUT,
		`Request exceeded timeout_seconds=${(plan.timeout_ms ?? 0) / 1000}`,
		plan.tool,
		{ retryable: true },
	);

export const plan_request_budgets = ({
	tool,
	candidates,
	max_providers,
	timeout_seconds,
	budget_usd,
}: RequestBudgetInput & {
	tool: string;
	candidates: readonly PlannedProvider[];
}): RequestBudgetPlan => {
	if (candidates.length === 0) {
		throw new ProviderError(
			ErrorType.INVALID_INPUT,
			'Request plan has no providers',
			tool,
			{ retryable: false },
		);
	}

	// One explicit provider is the cheap default: ignore caps,
	// wall-clock timeout, and USD so existing calls stay a no-op.
	if (candidates.length === 1) {
		return {
			tool,
			providers: [...candidates],
			estimated_cost_usd: round_usd(candidates[0].estimated_cost_usd),
			applied: false,
		};
	}

	const cap = max_providers ?? DEFAULT_MAX_PROVIDERS;
	const providers = candidates.slice(0, cap).map((provider) => ({
		...provider,
		estimated_cost_usd: round_usd(provider.estimated_cost_usd),
	}));
	const estimated_cost_usd = round_usd(
		providers.reduce(
			(sum, provider) => sum + provider.estimated_cost_usd,
			0,
		),
	);

	if (
		budget_usd !== undefined &&
		estimated_cost_usd > round_usd(budget_usd)
	) {
		const names = providers.map((provider) => provider.id).join(', ');
		throw new ProviderError(
			ErrorType.INVALID_INPUT,
			`Request budget exceeded: estimated $${estimated_cost_usd.toFixed(4)} for ${names} exceeds budget_usd=${budget_usd}`,
			tool,
			{
				retryable: false,
				estimated_cost_usd,
				budget_usd,
				providers: providers.map((provider) => provider.id),
			},
		);
	}

	return {
		tool,
		providers,
		estimated_cost_usd,
		timeout_ms: (timeout_seconds ?? DEFAULT_TIMEOUT_SECONDS) * 1000,
		applied: true,
	};
};

export const run_with_request_timeout = async <T>(
	plan: RequestBudgetPlan,
	work: (signal?: AbortSignal) => Promise<T>,
): Promise<T> => {
	if (!plan.applied || plan.timeout_ms === undefined) {
		return work();
	}

	const signal = AbortSignal.timeout(plan.timeout_ms);
	const timeout = new Promise<never>((_, reject) => {
		const fail = () => reject(request_timeout_error(plan));
		if (signal.aborted) {
			fail();
			return;
		}
		signal.addEventListener('abort', fail, { once: true });
	});

	try {
		return await Promise.race([work(signal), timeout]);
	} catch (error) {
		if (error instanceof ProviderError) throw error;
		if (signal.aborted || is_abort_error(error)) {
			throw request_timeout_error(plan);
		}
		throw error;
	}
};

export const plan_and_run = async <T>(
	tool: string,
	candidates: readonly PlannedProvider[],
	budget: RequestBudgetInput,
	work: (plan: RequestBudgetPlan, signal?: AbortSignal) => Promise<T>,
): Promise<T> => {
	const plan = plan_request_budgets({
		tool,
		candidates,
		...budget,
	});

	return run_with_request_timeout(plan, (signal) =>
		work(plan, signal),
	);
};
