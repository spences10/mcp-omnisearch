import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const max_safe_chars = 80_000;
export type LargeResultMode = 'inline' | 'file';

export interface HandleLargeResultOptions {
	mode?: LargeResultMode;
}

export interface LargeResultResponse {
	file_path: string;
	total_lines: number;
	estimated_tokens: number;
	read_hint: string;
}

export const handle_large_result = <T>(
	result: T,
	provider_name: string,
	options: HandleLargeResultOptions = {},
): T | LargeResultResponse => {
	const json = JSON.stringify(result, null, 2);
	const mode =
		options.mode ?? process.env.OMNISEARCH_LARGE_RESULT_MODE;
	if (json.length <= max_safe_chars || mode === 'inline')
		return result;

	// Offload only the final execution envelope, never intermediate API results.
	// File paths are useful only when client and server share a filesystem.
	const file_path = join(
		tmpdir(),
		`mcp-${provider_name}-${randomUUID()}.txt`,
	);
	writeFileSync(file_path, json, 'utf8');
	return {
		file_path,
		total_lines: json.split('\n').length,
		estimated_tokens: Math.round(json.length / 4),
		read_hint: `Use Read tool with file_path="${file_path}" and offset=LINE_NUMBER limit=50 to read the JSON result`,
	};
};
