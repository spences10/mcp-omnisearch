// Provider availability logging; authentication stays in codemode/providers.ts.
const api_key_names = [
	'TAVILY_API_KEY',
	'BRAVE_API_KEY',
	'KAGI_API_KEY',
	'GITHUB_API_KEY',
	'FIRECRAWL_API_KEY',
	'EXA_API_KEY',
	'LINKUP_API_KEY',
];

const remote_deployment_markers = [
	'AWS_LAMBDA_FUNCTION_NAME',
	'CONTAINER',
	'DOCKER_CONTAINER',
	'FLY_APP_NAME',
	'K_SERVICE',
	'RENDER',
	'VERCEL',
];

export const should_warn_for_local_file_offload = (
	env: NodeJS.ProcessEnv = process.env,
) =>
	env.OMNISEARCH_LARGE_RESULT_MODE === 'file' &&
	remote_deployment_markers.some((marker) => Boolean(env[marker]));

export const warn_for_local_file_offload = (
	env: NodeJS.ProcessEnv = process.env,
	warn: (message: string) => void = console.warn,
) => {
	if (!should_warn_for_local_file_offload(env)) return;
	warn(
		'Warning: OMNISEARCH_LARGE_RESULT_MODE=file returns server-side temp-file paths and is only useful for local shared-filesystem stdio clients. Use OMNISEARCH_LARGE_RESULT_MODE=inline for remote, hosted, or containerized MCP deployments.',
	);
};

export const validate_config = () => {
	const available_keys = api_key_names.filter((key) =>
		process.env[key]?.trim(),
	);
	const missing_keys = api_key_names.filter(
		(key) => !process.env[key]?.trim(),
	);

	if (available_keys.length > 0) {
		console.error(`Found API keys for: ${available_keys.join(', ')}`);
	} else {
		console.error(
			'Warning: No API keys found. No providers will be available.',
		);
	}
	if (missing_keys.length > 0) {
		console.warn(
			`Missing API keys for: ${missing_keys.join(', ')}. Some providers will not be available.`,
		);
	}
	warn_for_local_file_offload();
};
