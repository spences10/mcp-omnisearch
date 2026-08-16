const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);
const FALSE_VALUES = new Set(['0', 'false', 'no', 'off']);

export const parse_name_list = (
	value: string | undefined,
): string[] =>
	(value ?? '')
		.split(',')
		.map((item) => item.trim().toLowerCase())
		.filter(Boolean);

export const parse_bool_env = (
	value: string | undefined,
): boolean | undefined => {
	if (value === undefined || value.trim() === '') return undefined;

	const normalized = value.trim().toLowerCase();
	if (TRUE_VALUES.has(normalized)) return true;
	if (FALSE_VALUES.has(normalized)) return false;

	return undefined;
};

export const provider_env_token = (value: string): string =>
	value
		.replace(/[^a-zA-Z0-9]+/g, '_')
		.replace(/^_|_$/g, '')
		.toUpperCase();

const list_includes = (list: string[], id: string, name: string) =>
	list.includes(id.toLowerCase()) ||
	list.includes(name.toLowerCase());

/**
 * Resolve whether a provider may be chosen by automatic routing,
 * fan-out, or failover. Explicit `provider` calls ignore this gate.
 *
 * Override order: per-id env, per-name env, OMNISEARCH_AUTO_ALLOW,
 * OMNISEARCH_AUTO_DENY, then the declared default (true when omitted).
 */
export const resolve_auto_allow = (
	id: string,
	name: string,
	declared = true,
	env: NodeJS.ProcessEnv = process.env,
): boolean => {
	const per_id = parse_bool_env(
		env[`OMNISEARCH_AUTO_ALLOW_${provider_env_token(id)}`],
	);
	if (per_id !== undefined) return per_id;

	const per_name = parse_bool_env(
		env[`OMNISEARCH_AUTO_ALLOW_${provider_env_token(name)}`],
	);
	if (per_name !== undefined) return per_name;

	if (
		list_includes(
			parse_name_list(env.OMNISEARCH_AUTO_ALLOW),
			id,
			name,
		)
	) {
		return true;
	}

	if (
		list_includes(parse_name_list(env.OMNISEARCH_AUTO_DENY), id, name)
	) {
		return false;
	}

	return declared;
};
