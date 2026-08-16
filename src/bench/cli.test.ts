import { describe, expect, it } from 'vitest';
import { ErrorType, ProviderError } from '../common/types.js';
import { PROVIDER_BENCH_WARNING } from './provider-bench.js';
import {
	format_help,
	parse_bench_args,
	parse_startup,
	run_provider_bench_cli,
} from './cli.js';

describe('provider bench CLI', () => {
	it('parses help, server, and bench startup actions', () => {
		expect(parse_startup(['--help']).action).toBe('help');
		expect(parse_startup(['-h']).action).toBe('help');
		expect(parse_startup([])).toEqual({ action: 'server' });
		expect(parse_startup(['--bench'])).toEqual({
			action: 'bench',
			options: { json: false },
		});
		expect(parse_startup(['bench', '--json'])).toEqual({
			action: 'bench',
			options: { json: true },
		});
		expect(parse_startup(['--bench', '--unknown'])).toEqual({
			action: 'error',
			message: 'Unknown bench option: --unknown',
		});
	});

	it('parses bench flags and rejects invalid values', () => {
		expect(
			parse_bench_args([
				'--bench',
				'--json',
				'--providers',
				'tavily, brave',
				'--limit',
				'3',
			]),
		).toEqual({
			json: true,
			providers: ['tavily', 'brave'],
			limit: 3,
		});

		expect(() => parse_bench_args(['--providers'])).toThrow(
			/`--providers` requires a comma-separated list/,
		);
		expect(() => parse_bench_args(['--providers', ' , '])).toThrow(
			/`--providers` requires a comma-separated list/,
		);
		expect(() => parse_bench_args(['--limit', '0'])).toThrow(
			/`--limit` must be an integer from 1 to 50/,
		);
		expect(() => parse_bench_args(['--limit', 'nope'])).toThrow(
			/`--limit` must be an integer from 1 to 50/,
		);
	});

	it('prints help text that warns about quota spend', () => {
		const help = format_help();
		expect(help).toContain('mcp-omnisearch --bench');
		expect(help).toContain(PROVIDER_BENCH_WARNING);
	});

	it('prints JSON and stays read-only', async () => {
		const stdout: string[] = [];
		const stderr: string[] = [];

		const code = await run_provider_bench_cli({
			args: ['--bench', '--json', '--limit', '2'],
			providers: [
				{
					id: 'brave',
					search: async () => [
						{
							title: 'Docs',
							url: 'https://example.com',
							snippet: 'Hello',
							source_provider: 'brave',
						},
					],
				},
			],
			stdout: (line) => stdout.push(line),
			stderr: (line) => stderr.push(line),
		});

		expect(code).toBe(0);
		expect(stderr[0]).toBe(PROVIDER_BENCH_WARNING);
		expect(stderr[1]).toContain('Estimated requests: 4');
		const report = JSON.parse(stdout[0]);
		expect(report.wrote_config).toBe(false);
		expect(report.feeds_adaptive_stats).toBe(false);
		expect(report.recommended_priority).toEqual(['brave']);
		expect(report.limit).toBe(2);
	});

	it('returns an error when no providers are configured', async () => {
		const stderr: string[] = [];
		const code = await run_provider_bench_cli({
			args: ['--bench'],
			providers: [],
			stdout: () => {},
			stderr: (line) => stderr.push(line),
		});

		expect(code).toBe(1);
		expect(stderr.join('\n')).toContain(
			'No web_search providers are configured',
		);
	});

	it('returns an error for unknown provider filters', async () => {
		const stderr: string[] = [];
		const code = await run_provider_bench_cli({
			args: ['--bench', '--providers', 'missing'],
			providers: [
				{
					id: 'brave',
					search: async () => {
						throw new ProviderError(
							ErrorType.API_ERROR,
							'should not run',
							'brave',
						);
					},
				},
			],
			stdout: () => {},
			stderr: (line) => stderr.push(line),
		});

		expect(code).toBe(1);
		expect(stderr.join('\n')).toContain(
			'Unknown or unconfigured provider',
		);
	});

	it('prints help from the CLI runner', async () => {
		const stdout: string[] = [];
		const code = await run_provider_bench_cli({
			args: ['--help'],
			providers: [],
			stdout: (line) => stdout.push(line),
			stderr: () => {},
		});

		expect(code).toBe(0);
		expect(stdout[0]).toContain('Usage:');
	});

	it('prints a table by default and rejects a server-only invocation', async () => {
		const stdout: string[] = [];
		const table_code = await run_provider_bench_cli({
			args: ['--bench'],
			providers: [
				{
					id: 'brave',
					search: async () => [
						{
							title: 'Docs',
							url: 'https://example.com',
							snippet: 'Hello',
							source_provider: 'brave',
						},
					],
				},
			],
			stdout: (line) => stdout.push(line),
			stderr: () => {},
		});

		expect(table_code).toBe(0);
		expect(stdout[0]).toContain('Recommended provider priority:');

		const stderr: string[] = [];
		const server_code = await run_provider_bench_cli({
			args: [],
			providers: [],
			stdout: () => {},
			stderr: (line) => stderr.push(line),
		});
		expect(server_code).toBe(1);
		expect(stderr[0]).toBe('Expected a bench command');
	});
});
