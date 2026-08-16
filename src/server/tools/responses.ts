import {
	build_adaptive_quality_report,
	record_tool_outcome,
} from '../../common/adaptive-routing.js';
import { create_error_response } from '../../common/errors.js';
import {
	handle_large_result,
	type LargeResultMode,
} from '../../common/results.js';

export const create_json_tool_response = (payload: unknown) => ({
	content: [
		{
			type: 'text' as const,
			text: JSON.stringify(payload, null, 2),
		},
	],
});

export const create_error_tool_response = (error: Error) => ({
	...create_json_tool_response(create_error_response(error)),
	isError: true,
});

export interface AdaptiveToolOptions {
	provider: string;
	candidates?: readonly string[];
	result_count?: (result: unknown) => number;
}

export interface ToolResultOptions {
	large_result_mode?: LargeResultMode;
	quality_report?: boolean;
	adaptive?: AdaptiveToolOptions;
}

const attach_quality_report = (
	payload: unknown,
	options: ToolResultOptions,
) => {
	if (!options.quality_report) return payload;

	const provider = options.adaptive?.provider;
	const candidates =
		options.adaptive?.candidates ?? (provider ? [provider] : []);

	return {
		result: payload,
		quality_report: {
			adaptive_routing: build_adaptive_quality_report({
				candidates,
				explicit_provider: provider,
			}),
		},
	};
};

export const handle_tool_result = async <T>(
	tool_name: string,
	result: () => Promise<T>,
	options: ToolResultOptions = {},
) => {
	const started_at_ms = Date.now();
	try {
		const payload = await result();
		record_tool_outcome({
			provider: options.adaptive?.provider,
			started_at_ms,
			result: payload,
			result_count: options.adaptive?.result_count,
		});
		return create_json_tool_response(
			attach_quality_report(
				handle_large_result(payload, tool_name, {
					mode: options.large_result_mode,
				}),
				options,
			),
		);
	} catch (error) {
		record_tool_outcome({
			provider: options.adaptive?.provider,
			started_at_ms,
			error,
		});
		return create_error_tool_response(error as Error);
	}
};
