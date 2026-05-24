#!/usr/bin/env node
/// <reference types="node" />

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

type Finding = { file: string; message: string };

const max_source_lines = 300;
const advisories: Finding[] = [];

function git_files(pattern: string): string[] {
	return execFileSync('git', ['ls-files', pattern], {
		encoding: 'utf8',
	})
		.split('\n')
		.filter(Boolean)
		.filter((file) => !file.includes('/dist/'));
}

function should_check_file_size(file: string): boolean {
	if (file.endsWith('.test.ts') || file.endsWith('.spec.ts')) {
		return false;
	}
	if (file.endsWith('.d.ts')) return false;
	return true;
}

function check_file_size(file: string) {
	if (!should_check_file_size(file)) return;

	const source = readFileSync(file, 'utf8');
	const lines = source.split('\n').length;
	if (lines <= max_source_lines) return;

	advisories.push({
		file,
		message: `large source file (${lines} lines); consider splitting when you next touch it`,
	});
}

function print_findings(label: string, findings: Finding[]) {
	console.error(`${label}:`);
	for (const finding of findings) {
		console.error(`- ${finding.file}: ${finding.message}`);
	}
}

function run() {
	const files = git_files('*.ts');
	for (const file of files) check_file_size(file);

	if (advisories.length) {
		print_findings('Architecture advisories', advisories);
	}

	console.log(
		`Advisory check passed (${files.length} files scanned, ${advisories.length} advisories).`,
	);
}

run();
