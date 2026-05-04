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

export const create_error_tool_response = (error: Error) => {
	const error_response = create_error_response(error);

	return {
		content: [
			{
				type: 'text' as const,
				text: error_response.error,
			},
		],
		isError: true,
	};
};

export interface ToolResultOptions {
	large_result_mode?: LargeResultMode;
}

export const handle_tool_result = async <T>(
	tool_name: string,
	result: () => Promise<T>,
	options: ToolResultOptions = {},
) => {
	try {
		return create_json_tool_response(
			handle_large_result(await result(), tool_name, {
				mode: options.large_result_mode,
			}),
		);
	} catch (error) {
		return create_error_tool_response(error as Error);
	}
};
