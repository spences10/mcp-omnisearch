import { parse_search_operators } from '../common/search-operators.js';
import { ErrorType, ProviderError } from '../common/types.js';

export const AUTO_PROVIDER = 'auto';

export const WEB_SEARCH_PRIORITY = [
	'tavily',
	'brave',
	'kagi',
	'exa',
	'kagi_enrichment',
] as const;

export const AI_SEARCH_PRIORITY = [
	'kagi_fastgpt',
	'exa_answer',
	'linkup',
] as const;

export const WEB_EXTRACT_PRIORITY = [
	'tavily',
	'firecrawl',
	'kagi',
	'exa',
] as const;

export type AutoRoutingTool =
	| 'web_search'
	| 'ai_search'
	| 'web_extract';

export type QuerySignal =
	| 'operators'
	| 'freshness'
	| 'news'
	| 'semantic'
	| 'docs_code'
	| 'academic'
	| 'enrichment'
	| 'deep'
	| 'video'
	| 'summarize'
	| 'docs_site'
	| 'similar';

export interface RoutingCandidate {
	name: string;
	modes?: readonly string[];
}

export interface RoutingScore {
	name: string;
	score: number;
	matched_signals: QuerySignal[];
}

export interface RoutingDecision {
	tool: AutoRoutingTool;
	provider: string;
	source: 'explicit' | 'auto';
	reason: string;
	signals: QuerySignal[];
	scores: RoutingScore[];
}

export interface SelectProviderInput {
	tool: AutoRoutingTool;
	provider?: string;
	query?: string;
	url?: string | string[];
	mode?: string;
	include_domains?: string[];
	exclude_domains?: string[];
	candidates: readonly RoutingCandidate[];
}

type SignalOrGeneral = QuerySignal | 'general';
type WeightTable = Record<
	string,
	Partial<Record<SignalOrGeneral, number>>
>;

const SIGNAL_ORDER: readonly QuerySignal[] = [
	'operators',
	'freshness',
	'news',
	'semantic',
	'docs_code',
	'academic',
	'enrichment',
	'deep',
	'video',
	'summarize',
	'docs_site',
	'similar',
];

const SIGNAL_PATTERNS: ReadonlyArray<readonly [QuerySignal, RegExp]> =
	[
		[
			'freshness',
			/\b(today|yesterday|latest|breaking|this week|this month|last 24|past week|past month|recent)\b/i,
		],
		[
			'news',
			/\b(news|headline|headlines|reuters|bloomberg|cnn|bbc|nytimes|new york times)\b/i,
		],
		[
			'semantic',
			/\b(similar|related to|like this|semantic|discover|research papers|find articles|meaning)\b/i,
		],
		[
			'docs_code',
			/\b(docs|documentation|api reference|github|stackoverflow|stack overflow|npm|pypi|how to|typescript|changelog)\b/i,
		],
		[
			'academic',
			/\b(arxiv|doi|research papers?|journal|pubmed|scholar|preprint|papers?)\b/i,
		],
		[
			'enrichment',
			/\b(specialized|non-mainstream|teclis|tinygem|enrichment)\b/i,
		],
		[
			'deep',
			/\b(deep|thorough|comprehensive|agentic|in-depth|in depth)\b/i,
		],
		['video', /\b(youtube\.com|youtu\.be|vimeo\.com|podcast)\b/i],
		['summarize', /\b(summarize|summary|tldr|tl;dr)\b/i],
		[
			'docs_site',
			/\bdocs\.|developer\.|\/docs(?:\/|$)|\/api(?:\/|$)|\/reference(?:\/|$)/i,
		],
		['similar', /\b(similar pages|find similar|pages like)\b/i],
	];

const WEB_SEARCH_WEIGHTS: WeightTable = {
	tavily: {
		general: 1,
		freshness: 3,
		news: 2,
		docs_code: 2,
		operators: 2,
	},
	brave: {
		general: 1,
		operators: 4,
		news: 3,
		freshness: 2,
		docs_code: 3,
	},
	kagi: {
		general: 1,
		operators: 4,
		docs_code: 3,
		academic: 2,
	},
	exa: { general: 1, semantic: 5, academic: 4 },
	kagi_enrichment: { news: 2, academic: 2, enrichment: 5 },
};

const AI_SEARCH_WEIGHTS: WeightTable = {
	kagi_fastgpt: { general: 1 },
	exa_answer: { general: 1, semantic: 4 },
	linkup: { general: 1, deep: 4 },
};

const WEB_EXTRACT_WEIGHTS: WeightTable = {
	tavily: { general: 1 },
	firecrawl: { general: 1, docs_site: 3 },
	kagi: { video: 5, summarize: 4 },
	exa: { general: 1, similar: 5 },
};

const PRIORITY_BY_TOOL: Record<AutoRoutingTool, readonly string[]> = {
	web_search: WEB_SEARCH_PRIORITY,
	ai_search: AI_SEARCH_PRIORITY,
	web_extract: WEB_EXTRACT_PRIORITY,
};

const WEIGHTS_BY_TOOL: Record<AutoRoutingTool, WeightTable> = {
	web_search: WEB_SEARCH_WEIGHTS,
	ai_search: AI_SEARCH_WEIGHTS,
	web_extract: WEB_EXTRACT_WEIGHTS,
};

const FRESHNESS_OPERATORS = new Set(['before', 'after']);

let last_routing_decision: RoutingDecision | undefined;

/**
 * True when the caller omitted provider or asked for auto-routing.
 */
export const is_auto_provider = (
	provider: string | undefined,
): boolean =>
	provider === undefined ||
	provider.trim().toLowerCase() === AUTO_PROVIDER;

/**
 * Return the last explicit or auto-routing decision for diagnostics.
 */
export const get_last_routing_decision = ():
	| RoutingDecision
	| undefined => last_routing_decision;

const unique_signals = (signals: Iterable<QuerySignal>) => {
	const found = new Set(signals);
	return SIGNAL_ORDER.filter((signal) => found.has(signal));
};

/**
 * Classify a query or URL into deterministic routing signals.
 */
export const detect_query_signals = (text: string): QuerySignal[] => {
	const found = new Set<QuerySignal>();
	const parsed = parse_search_operators(text);

	if (parsed.operators.length > 0) {
		found.add('operators');
	}
	if (
		parsed.operators.some((operator) =>
			FRESHNESS_OPERATORS.has(operator.type),
		)
	) {
		found.add('freshness');
	}

	for (const [signal, pattern] of SIGNAL_PATTERNS) {
		if (pattern.test(text)) {
			found.add(signal);
		}
	}

	return unique_signals(found);
};

const priority_index = (
	priority: readonly string[],
	name: string,
) => {
	const index = priority.indexOf(name);
	return index === -1 ? priority.length : index;
};

const eligible_candidates = (
	input: SelectProviderInput,
): RoutingCandidate[] => {
	const seen = new Set<string>();
	const eligible: RoutingCandidate[] = [];

	for (const candidate of input.candidates) {
		if (seen.has(candidate.name)) continue;
		if (
			input.mode &&
			candidate.modes &&
			candidate.modes.length > 0 &&
			!candidate.modes.includes(input.mode)
		) {
			continue;
		}
		seen.add(candidate.name);
		eligible.push(candidate);
	}

	return eligible;
};

const routing_text = (input: SelectProviderInput) =>
	[
		input.query,
		Array.isArray(input.url) ? input.url.join(' ') : input.url,
	]
		.filter((value): value is string => Boolean(value))
		.join(' ');

const score_candidates = (
	tool: AutoRoutingTool,
	candidates: readonly RoutingCandidate[],
	signals: readonly QuerySignal[],
): RoutingScore[] => {
	const weights = WEIGHTS_BY_TOOL[tool];

	return candidates.map((candidate) => {
		const table = weights[candidate.name] ?? { general: 1 };
		let score = table.general ?? 0;
		const matched_signals: QuerySignal[] = [];

		for (const signal of signals) {
			const bump = table[signal] ?? 0;
			if (bump > 0) {
				score += bump;
				matched_signals.push(signal);
			}
		}

		return {
			name: candidate.name,
			score,
			matched_signals,
		};
	});
};

const pick_winner = (
	scores: readonly RoutingScore[],
	priority: readonly string[],
) =>
	[...scores].sort((left, right) => {
		if (right.score !== left.score) {
			return right.score - left.score;
		}
		return (
			priority_index(priority, left.name) -
			priority_index(priority, right.name)
		);
	})[0];

const auto_reason = (
	winner: RoutingScore,
	signals: readonly QuerySignal[],
	priority: readonly string[],
) => {
	const signal_text =
		signals.length > 0 ? signals.join(', ') : 'none';
	return `auto-routed to ${winner.name} (score ${winner.score}) from signals: ${signal_text}; ties break by ${priority.join(' > ')}`;
};

const remember = (decision: RoutingDecision) => {
	last_routing_decision = decision;
	return decision;
};

/**
 * Pick exactly one provider. Explicit names always win; omitted or
 * "auto" scores configured candidates from query signals.
 */
export const select_provider = (
	input: SelectProviderInput,
): RoutingDecision => {
	if (!is_auto_provider(input.provider)) {
		return remember({
			tool: input.tool,
			provider: input.provider!.trim(),
			source: 'explicit',
			reason: `explicit provider override: ${input.provider!.trim()}`,
			signals: [],
			scores: [],
		});
	}

	const eligible = eligible_candidates(input);
	if (eligible.length === 0) {
		const mode_text = input.mode ? ` mode "${input.mode}"` : '';
		throw new ProviderError(
			ErrorType.INVALID_INPUT,
			`No eligible provider for ${input.tool}${mode_text}. Configure a matching API key or pass an explicit provider.`,
			input.tool,
		);
	}

	const signals = detect_query_signals(routing_text(input));
	if (
		(input.include_domains?.length ?? 0) > 0 ||
		(input.exclude_domains?.length ?? 0) > 0
	) {
		if (!signals.includes('operators')) {
			signals.push('operators');
		}
	}

	const ordered_signals = unique_signals(signals);
	const scores = score_candidates(
		input.tool,
		eligible,
		ordered_signals,
	);
	const priority = PRIORITY_BY_TOOL[input.tool];
	const winner = pick_winner(scores, priority);

	return remember({
		tool: input.tool,
		provider: winner.name,
		source: 'auto',
		reason: auto_reason(winner, ordered_signals, priority),
		signals: ordered_signals,
		scores,
	});
};
