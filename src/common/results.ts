import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ErrorType, ProviderError } from './types.js';

const CHARS_PER_TOKEN = 4;
const MAX_SAFE_TOKENS = 20000;
const MAX_SAFE_CHARS = MAX_SAFE_TOKENS * CHARS_PER_TOKEN;

export interface Section {
	title: string;
	line: number;
}

export interface LargeResultResponse {
	file_path: string;
	total_lines: number;
	estimated_tokens: number;
	sections: Section[];
	read_hint: string;
	metadata?: Record<string, unknown>;
}

interface FormatResult {
	text: string;
	sections: Section[];
	total_lines: number;
}

const format_as_text = (
	result: Record<string, unknown>,
): FormatResult => {
	const lines: string[] = [];
	const sections: Section[] = [];
	let current_line = 1;

	const add_line = (line: string) => {
		if (line.startsWith('URL: ')) {
			sections.push({ title: line, line: current_line });
		} else if (line.startsWith('# ')) {
			sections.push({
				title: line.slice(2),
				line: current_line,
			});
		} else if (line.startsWith('## ')) {
			sections.push({
				title: line.slice(3),
				line: current_line,
			});
		} else if (line.startsWith('### ')) {
			sections.push({
				title: line.slice(4),
				line: current_line,
			});
		}
		lines.push(line);
		current_line++;
	};

	const add_content = (content: string) => {
		const content_lines = content.split('\n');
		for (const line of content_lines) {
			add_line(line);
		}
	};

	const raw_contents = result.raw_contents as
		| Array<{ url: string; content: string }>
		| undefined;

	if (raw_contents?.length) {
		for (const item of raw_contents) {
			add_line('='.repeat(80));
			add_line(`URL: ${item.url}`);
			add_line('='.repeat(80));
			if (item.content) {
				add_content(item.content);
			}
			add_line('');
		}
	} else if (result.content) {
		add_content(JSON.stringify(result.content));
	} else {
		add_content(JSON.stringify(result, null, 2));
	}

	if (result.metadata) {
		add_line('');
		add_line('='.repeat(80));
		sections.push({ title: 'METADATA', line: current_line });
		add_line('METADATA');
		add_line('='.repeat(80));
		add_content(JSON.stringify(result.metadata, null, 2));
	}

	return {
		text: lines.join('\n'),
		sections,
		total_lines: current_line - 1,
	};
};

export const handle_large_result = <T>(
	result: T,
	provider_name: string,
): T | LargeResultResponse => {
	const json = JSON.stringify(result, null, 2);
	const char_count = json.length;

	if (char_count <= MAX_SAFE_CHARS) {
		return result;
	}

	const file_id = randomUUID();
	const file_path = join(
		tmpdir(),
		`mcp-${provider_name}-${file_id}.txt`,
	);
	const { text, sections, total_lines } = format_as_text(
		result as Record<string, unknown>,
	);
	writeFileSync(file_path, text, 'utf-8');

	const result_obj = result as Record<string, unknown>;
	const metadata = result_obj.metadata as
		| Record<string, unknown>
		| undefined;
	const word_count = metadata?.word_count ?? 'unknown';
	const urls_processed = metadata?.urls_processed ?? 'unknown';

	return {
		file_path,
		total_lines,
		estimated_tokens: Math.round(char_count / CHARS_PER_TOKEN),
		sections,
		read_hint: `Use Read tool with file_path="${file_path}" and offset=LINE_NUMBER limit=50 to read a section`,
		metadata: {
			word_count,
			urls_processed,
			source_provider: result_obj.source_provider,
		},
	};
};

export interface ProcessedUrlResult {
	url: string;
	content: string;
	metadata?: any;
	success: boolean;
	error?: string;
}

export const aggregate_url_results = (
	results: ProcessedUrlResult[],
	provider_name: string,
	urls: string[],
	extract_depth: 'basic' | 'advanced',
) => {
	const successful_results = results.filter((r) => r.success);
	const failed_urls = results
		.filter((r) => !r.success)
		.map((r) => r.url);

	if (successful_results.length === 0) {
		throw new ProviderError(
			ErrorType.PROVIDER_ERROR,
			'Failed to extract content from all URLs',
			provider_name,
		);
	}

	const raw_contents = successful_results.map((result) => ({
		url: result.url,
		content: result.content,
	}));

	const combined_content = raw_contents
		.map((result) => result.content)
		.join('\n\n');

	const word_count = combined_content
		.split(/\s+/)
		.filter(Boolean).length;

	const title = successful_results[0]?.metadata?.title;

	return {
		content: combined_content,
		raw_contents,
		metadata: {
			title,
			word_count,
			failed_urls: failed_urls.length > 0 ? failed_urls : undefined,
			urls_processed: urls.length,
			successful_extractions: successful_results.length,
			extract_depth,
		},
		source_provider: provider_name,
	};
};
