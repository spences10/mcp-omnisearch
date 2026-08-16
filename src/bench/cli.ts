import {
	PROVIDER_BENCH_DEFAULT_LIMIT,
	PROVIDER_BENCH_SUITE,
	PROVIDER_BENCH_WARNING,
	format_bench_text,
	run_provider_bench,
	select_bench_providers,
	type BenchableProvider,
	type ProviderBenchReport,
} from './provider-bench.js';

export interface ParsedBenchArgs {
	json: boolean;
	providers?: string[];
	limit?: number;
}

export type StartupAction =
	| { action: 'help'; text: string }
	| { action: 'bench'; options: ParsedBenchArgs }
	| { action: 'server' }
	| { action: 'error'; message: string };

export const format_help = (): string =>
	[
		'mcp-omnisearch — MCP server for Tavily, Brave, Kagi, Exa, GitHub, Linkup, and Firecrawl',
		'',
		'Usage:',
		'  mcp-omnisearch                 Start the MCP server on stdio',
		'  mcp-omnisearch --bench [opts]  Race configured web_search providers',
		'  mcp-omnisearch --help          Show this help',
		'',
		'Bench options:',
		'  --json              Print structured JSON instead of a table',
		'  --providers a,b     Limit to these configured web_search providers',
		'  --limit n           Results per query (default: 5, max: 50)',
		'',
		`Warning: ${PROVIDER_BENCH_WARNING}`,
	].join('\n');

export const is_help_request = (args: readonly string[]): boolean =>
	args.includes('--help') || args.includes('-h');

export const is_bench_request = (args: readonly string[]): boolean =>
	args[0] === 'bench' || args.includes('--bench');

export const parse_bench_args = (
	args: readonly string[],
): ParsedBenchArgs => {
	const options: ParsedBenchArgs = { json: false };
	const tokens = args.filter(
		(arg) => arg !== '--bench' && arg !== 'bench',
	);

	for (let index = 0; index < tokens.length; index += 1) {
		const token = tokens[index];
		if (token === '--json') {
			options.json = true;
			continue;
		}
		if (token === '--help' || token === '-h') {
			continue;
		}
		if (token === '--providers') {
			const value = tokens[index + 1];
			index += 1;
			if (!value || value.startsWith('-')) {
				throw new Error(
					'`--providers` requires a comma-separated list',
				);
			}
			const ids = value
				.split(',')
				.map((id) => id.trim())
				.filter(Boolean);
			if (ids.length === 0) {
				throw new Error(
					'`--providers` requires a comma-separated list',
				);
			}
			options.providers = ids;
			continue;
		}
		if (token === '--limit') {
			const value = tokens[index + 1];
			index += 1;
			const limit = Number(value);
			if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
				throw new Error('`--limit` must be an integer from 1 to 50');
			}
			options.limit = limit;
			continue;
		}
		throw new Error(`Unknown bench option: ${token}`);
	}

	return options;
};

export const parse_startup = (
	args: readonly string[],
): StartupAction => {
	if (is_help_request(args)) {
		return { action: 'help', text: format_help() };
	}

	if (!is_bench_request(args)) {
		return { action: 'server' };
	}

	try {
		return { action: 'bench', options: parse_bench_args(args) };
	} catch (error) {
		return {
			action: 'error',
			message:
				error instanceof Error
					? error.message
					: 'Invalid bench arguments',
		};
	}
};

export const format_bench_output = (
	report: ProviderBenchReport,
	json: boolean,
): string =>
	json ? JSON.stringify(report, null, 2) : format_bench_text(report);

export interface RunProviderBenchCliOptions {
	args: readonly string[];
	providers: readonly BenchableProvider[];
	stdout?: (line: string) => void;
	stderr?: (line: string) => void;
}

export const run_provider_bench_cli = async ({
	args,
	providers,
	stdout = console.log,
	stderr = console.error,
}: RunProviderBenchCliOptions): Promise<number> => {
	const startup = parse_startup(args);
	if (startup.action === 'help') {
		stdout(startup.text);
		return 0;
	}
	if (startup.action === 'error') {
		stderr(startup.message);
		return 1;
	}
	if (startup.action !== 'bench') {
		stderr('Expected a bench command');
		return 1;
	}

	try {
		const selected = select_bench_providers(
			providers,
			startup.options.providers,
		);
		const estimated = selected.length * PROVIDER_BENCH_SUITE.length;
		stderr(PROVIDER_BENCH_WARNING);
		stderr(
			`Estimated requests: ${estimated} (${selected.length} providers × 4 queries). Limit ${startup.options.limit ?? PROVIDER_BENCH_DEFAULT_LIMIT} results each.`,
		);

		const report = await run_provider_bench({
			providers: selected,
			limit: startup.options.limit,
		});
		stdout(format_bench_output(report, startup.options.json));
		return 0;
	} catch (error) {
		stderr(
			error instanceof Error
				? error.message
				: 'Provider bench failed',
		);
		return 1;
	}
};
