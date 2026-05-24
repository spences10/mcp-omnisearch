import * as v from 'valibot';
import { ErrorType, ProviderError } from './types.js';

export const parse_provider_response = <
	const TSchema extends v.BaseSchema<
		unknown,
		unknown,
		v.BaseIssue<unknown>
	>,
>(
	provider: string,
	schema: TSchema,
	data: unknown,
): v.InferOutput<TSchema> => {
	const result = v.safeParse(schema, data);

	if (result.success) return result.output;

	throw new ProviderError(
		ErrorType.PROVIDER_ERROR,
		`Malformed ${provider} response: ${v.summarize(result.issues)}`,
		provider,
		{ issue_count: result.issues.length },
	);
};
