import type { ResolvedMcpBackend } from '../config/mcp-backends.js';
import { ErrorType, ProviderError } from './types.js';
import type { SearchResult } from './types.js';

const is_record = (
	value: unknown,
): value is Record<string, unknown> =>
	typeof value === 'object' &&
	value !== null &&
	!Array.isArray(value);

const try_parse_json = (text: string): unknown => {
	try {
		return JSON.parse(text) as unknown;
	} catch {
		return undefined;
	}
};

const format_path = (path: Array<string | number>): string =>
	path.length === 0
		? '<root>'
		: path
				.map((segment) =>
					typeof segment === 'number'
						? `[${segment}]`
						: `.${segment}`,
				)
				.join('')
				.replace(/^\./, '');

const text_from_unknown = (value: unknown): string | undefined => {
	if (typeof value === 'string') {
		const trimmed = value.trim();
		return trimmed.length > 0 ? trimmed : undefined;
	}
	if (typeof value === 'number' && Number.isFinite(value)) {
		return String(value);
	}
	return undefined;
};

const first_alias_value = (
	item: Record<string, unknown>,
	aliases: readonly string[],
): unknown => {
	for (const alias of aliases) {
		if (!(alias in item)) continue;
		const value = item[alias];
		if (value === undefined || value === null) continue;
		if (typeof value === 'string' && value.trim() === '') continue;
		return value;
	}
	return undefined;
};

export const walk_result_path = (
	root: unknown,
	path: Array<string | number>,
): { ok: true; value: unknown } | { ok: false } => {
	let current = root;
	for (const segment of path) {
		if (typeof segment === 'number') {
			if (
				!Array.isArray(current) ||
				segment < 0 ||
				segment >= current.length
			) {
				return { ok: false };
			}
			current = current[segment];
			continue;
		}
		if (!is_record(current) || !(segment in current)) {
			return { ok: false };
		}
		current = current[segment];
	}
	return { ok: true, value: current };
};

export const mcp_tool_payload_roots = (
	result: unknown,
	provider: string,
): unknown[] => {
	if (!is_record(result)) return [result];

	if (result.isError === true) {
		const content = result.content;
		const text =
			Array.isArray(content) &&
			content.some(
				(block) => is_record(block) && typeof block.text === 'string',
			)
				? (
						content.find(
							(block) =>
								is_record(block) && typeof block.text === 'string',
						) as { text: string }
					).text
				: 'downstream MCP tool returned isError';
		throw new ProviderError(ErrorType.PROVIDER_ERROR, text, provider);
	}

	const roots: unknown[] = [];
	if (result.structuredContent !== undefined) {
		roots.push(result.structuredContent);
	}
	if (Array.isArray(result.content)) {
		for (const block of result.content) {
			if (
				!is_record(block) ||
				block.type !== 'text' ||
				typeof block.text !== 'string'
			) {
				continue;
			}
			const parsed = try_parse_json(block.text);
			if (parsed !== undefined) roots.push(parsed);
		}
	}
	if (
		result.results !== undefined ||
		(roots.length === 0 && result.content === undefined)
	) {
		roots.push(result);
	}
	return roots;
};

export const extract_result_list = (
	result: unknown,
	path: Array<string | number>,
	provider: string,
): unknown[] => {
	const roots = mcp_tool_payload_roots(result, provider);
	let saw_non_array = false;

	for (const root of roots) {
		const walked = walk_result_path(root, path);
		if (!walked.ok) continue;
		if (Array.isArray(walked.value)) return walked.value;
		saw_non_array = true;
	}

	throw new ProviderError(
		ErrorType.MALFORMED_RESPONSE,
		saw_non_array
			? `MCP backend ${provider} result_path ${format_path(path)} did not resolve to an array`
			: `MCP backend ${provider} result_path ${format_path(path)} was not found in the tool result`,
		provider,
		{ result_path: path },
	);
};

export const map_mcp_search_results = (
	items: unknown[],
	field_aliases: ResolvedMcpBackend['field_aliases'],
	provider: string,
): SearchResult[] =>
	items.map((item, index) => {
		if (!is_record(item)) {
			throw new ProviderError(
				ErrorType.MALFORMED_RESPONSE,
				`MCP backend ${provider} result[${index}] is not an object`,
				provider,
				{ index },
			);
		}

		const title = text_from_unknown(
			first_alias_value(item, field_aliases.title),
		);
		const url = text_from_unknown(
			first_alias_value(item, field_aliases.url),
		);
		if (!title || !url) {
			throw new ProviderError(
				ErrorType.MALFORMED_RESPONSE,
				`MCP backend ${provider} result[${index}] is missing title/url after field aliases`,
				provider,
				{
					index,
					title_aliases: field_aliases.title,
					url_aliases: field_aliases.url,
				},
			);
		}

		const snippet =
			text_from_unknown(
				first_alias_value(item, field_aliases.snippet),
			) ?? '';
		const score_value = first_alias_value(item, field_aliases.score);
		const score =
			typeof score_value === 'number' && Number.isFinite(score_value)
				? score_value
				: undefined;

		return {
			title,
			url,
			snippet,
			score,
			source_provider: provider,
		};
	});
