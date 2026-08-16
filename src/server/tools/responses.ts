import { create_error_response } from '../../common/errors.js';
import {
	handle_large_result,
	type LargeResultMode,
} from '../../common/results.js';
import {
	attach_quality_report,
	type QualityReport,
} from './quality-report.js';

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

export interface ToolResultOptions<T = unknown> {
	large_result_mode?: LargeResultMode;
	quality_report?: (raw: T | undefined) => QualityReport;
}

export const handle_tool_result = async <T>(
	tool_name: string,
	result: () => Promise<T>,
	options: ToolResultOptions<T> = {},
) => {
	try {
		const raw = await result();
		const handled = handle_large_result(raw, tool_name, {
			mode: options.large_result_mode,
		});
		const report = options.quality_report?.(raw);
		return create_json_tool_response(
			report ? attach_quality_report(handled, report) : handled,
		);
	} catch (error) {
		const base = create_error_response(error as Error);
		const report = options.quality_report?.(undefined);
		return {
			...create_json_tool_response(
				report ? attach_quality_report(base, report) : base,
			),
			isError: true,
		};
	}
};
