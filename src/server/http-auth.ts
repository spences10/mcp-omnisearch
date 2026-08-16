import { createHash, timingSafeEqual } from 'node:crypto';

const BEARER_PREFIX = /^bearer\s+(\S+)$/i;

export const extract_bearer_token = (
	authorization: string | undefined,
): string | undefined => {
	if (!authorization) return undefined;

	const match = authorization.match(BEARER_PREFIX);
	return match?.[1];
};

export const match_auth_token = (
	presented: string,
	tokens: readonly string[],
): string | undefined => {
	let matched: string | undefined;

	for (const token of tokens) {
		if (tokens_equal(presented, token)) {
			matched = token;
		}
	}

	return matched;
};

const tokens_equal = (left: string, right: string): boolean => {
	const left_hash = createHash('sha256').update(left).digest();
	const right_hash = createHash('sha256').update(right).digest();
	return timingSafeEqual(left_hash, right_hash);
};
