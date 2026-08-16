export interface AutoAllowCandidate {
	id: string;
	name: string;
	auto_allow: boolean;
}

export interface AutomaticSelection<T extends AutoAllowCandidate> {
	selected: T[];
	auto_allow_excluded: string[];
}

export type AutomaticUse = 'auto' | 'fan-out' | 'failover';

const unique_names = (names: readonly string[]): string[] =>
	Array.from(new Set(names));

const opted_in = (
	candidate: AutoAllowCandidate,
	opt_in: readonly string[],
) => {
	const tokens = opt_in.map((token) => token.toLowerCase());
	return (
		tokens.includes(candidate.id.toLowerCase()) ||
		tokens.includes(candidate.name.toLowerCase())
	);
};

export const is_allowed_for_automatic_use = (
	candidate: AutoAllowCandidate,
	opt_in: readonly string[] = [],
): boolean => candidate.auto_allow || opted_in(candidate, opt_in);

/**
 * Filter candidates for auto routing, fan-out, and failover.
 * Explicit provider selection must not use this helper.
 */
export const select_for_automatic_use = <
	T extends AutoAllowCandidate,
>(
	candidates: readonly T[],
	options: { opt_in?: readonly string[] } = {},
): AutomaticSelection<T> => {
	const selected: T[] = [];
	const excluded: string[] = [];

	for (const candidate of candidates) {
		if (is_allowed_for_automatic_use(candidate, options.opt_in)) {
			selected.push(candidate);
			continue;
		}

		excluded.push(candidate.name);
	}

	return {
		selected,
		auto_allow_excluded: unique_names(excluded),
	};
};

export const build_auto_allow_quality_report = (
	candidates: readonly AutoAllowCandidate[],
	options: { opt_in?: readonly string[] } = {},
) => ({
	auto_allow_excluded: select_for_automatic_use(candidates, options)
		.auto_allow_excluded,
});
