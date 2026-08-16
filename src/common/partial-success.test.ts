import { describe, expect, it } from 'vitest';
import { ErrorType, ProviderError } from './types.js';
import {
	build_partial_success_metadata,
	classify_provider_failure,
	normalize_provider_selection,
	run_selected_providers,
	settle_provider_calls,
} from './partial-success.js';

const SECRET = 'sk-live-super-secret-key';
const STACK_FRAGMENT = 'at BraveSearchProvider.search';

const serialized = (value: unknown) => JSON.stringify(value);

describe('classify_provider_failure', () => {
	it('uses ProviderError type and ignores timeout-like names on that class', () => {
		expect(
			classify_provider_failure(
				new ProviderError(
					ErrorType.RATE_LIMIT,
					`Rate limit for key ${SECRET}`,
					'tavily',
				),
			),
		).toBe(ErrorType.RATE_LIMIT);
	});

	it('classifies TimeoutError and AbortError as TIMEOUT', () => {
		const timeout = new Error(`timed out talking to ${SECRET}`);
		timeout.name = 'TimeoutError';
		const abort = new Error('aborted');
		abort.name = 'AbortError';

		expect(classify_provider_failure(timeout)).toBe(
			ErrorType.TIMEOUT,
		);
		expect(classify_provider_failure(abort)).toBe(ErrorType.TIMEOUT);
	});

	it('classifies unknown errors as API_ERROR', () => {
		expect(classify_provider_failure(new Error('boom'))).toBe(
			ErrorType.API_ERROR,
		);
		expect(classify_provider_failure('nope')).toBe(
			ErrorType.API_ERROR,
		);
	});
});

describe('build_partial_success_metadata', () => {
	it('copies provider sets and omits empty preempted', () => {
		expect(
			build_partial_success_metadata({
				selected: ['brave', 'tavily'],
				successful: ['brave'],
				failed: [{ provider: 'tavily', type: ErrorType.RATE_LIMIT }],
				timed_out: [],
				preempted: [],
			}),
		).toEqual({
			selected: ['brave', 'tavily'],
			successful: ['brave'],
			failed: [{ provider: 'tavily', type: ErrorType.RATE_LIMIT }],
			timed_out: [],
		});
	});

	it('includes preempted cooldown skips when present', () => {
		expect(
			build_partial_success_metadata({
				selected: ['brave'],
				successful: ['brave'],
				failed: [],
				timed_out: [],
				preempted: ['kagi'],
			}).preempted,
		).toEqual(['kagi']);
	});

	it('strips extra fields from failed entries', () => {
		const metadata = build_partial_success_metadata({
			selected: ['tavily'],
			successful: [],
			failed: [
				{
					provider: 'tavily',
					type: ErrorType.AUTH_ERROR,
					message: `Invalid key ${SECRET}`,
					stack: STACK_FRAGMENT,
				} as { provider: string; type: ErrorType },
			],
			timed_out: [],
		});

		expect(metadata.failed).toEqual([
			{ provider: 'tavily', type: ErrorType.AUTH_ERROR },
		]);
		expect(serialized(metadata)).not.toContain(SECRET);
		expect(serialized(metadata)).not.toContain(STACK_FRAGMENT);
	});
});

describe('settle_provider_calls', () => {
	it('returns concatenated successful results and names the provider sets', async () => {
		const outcome = await settle_provider_calls([
			{
				provider: 'brave',
				run: async () => [{ title: 'brave-hit' }],
			},
			{
				provider: 'tavily',
				run: async () => [{ title: 'tavily-hit' }],
			},
		]);

		expect(outcome.values).toEqual([
			[{ title: 'brave-hit' }],
			[{ title: 'tavily-hit' }],
		]);
		expect(outcome.metadata).toEqual({
			selected: ['brave', 'tavily'],
			successful: ['brave', 'tavily'],
			failed: [],
			timed_out: [],
		});
	});

	it('keeps successful results when another provider fails', async () => {
		const outcome = await settle_provider_calls([
			{
				provider: 'brave',
				run: async () => [{ title: 'only-brave' }],
			},
			{
				provider: 'tavily',
				run: async () => {
					throw new ProviderError(
						ErrorType.RATE_LIMIT,
						`Rate limit exceeded for ${SECRET}`,
						'tavily',
						{ cause: `stack ${STACK_FRAGMENT}` },
					);
				},
			},
		]);

		expect(outcome.values).toEqual([[{ title: 'only-brave' }]]);
		expect(outcome.metadata).toEqual({
			selected: ['brave', 'tavily'],
			successful: ['brave'],
			failed: [{ provider: 'tavily', type: ErrorType.RATE_LIMIT }],
			timed_out: [],
		});
		expect(serialized(outcome)).not.toContain(SECRET);
		expect(serialized(outcome)).not.toContain(STACK_FRAGMENT);
		expect(serialized(outcome.metadata.failed)).not.toContain(
			'message',
		);
	});

	it('records timeouts separately from failed providers', async () => {
		const timeout = new Error(`AbortSignal.timeout ${SECRET}`);
		timeout.name = 'TimeoutError';

		const outcome = await settle_provider_calls([
			{
				provider: 'brave',
				run: async () => [{ title: 'ok' }],
			},
			{
				provider: 'exa',
				run: async () => {
					throw timeout;
				},
			},
			{
				provider: 'kagi',
				run: async () => {
					throw new ProviderError(
						ErrorType.TIMEOUT,
						`kagi exceeded ${SECRET}`,
						'kagi',
					);
				},
			},
		]);

		expect(outcome.values).toEqual([[{ title: 'ok' }]]);
		expect(outcome.metadata.successful).toEqual(['brave']);
		expect(outcome.metadata.failed).toEqual([]);
		expect(outcome.metadata.timed_out).toEqual(['exa', 'kagi']);
		expect(serialized(outcome)).not.toContain(SECRET);
	});

	it('returns an empty result list when every selected provider fails', async () => {
		const outcome = await settle_provider_calls([
			{
				provider: 'brave',
				run: async () => {
					throw new ProviderError(
						ErrorType.AUTH_ERROR,
						`Invalid API key ${SECRET}`,
						'brave',
					);
				},
			},
			{
				provider: 'tavily',
				run: async () => {
					throw new Error(`upstream 500 ${SECRET}`);
				},
			},
		]);

		expect(outcome.values).toEqual([]);
		expect(outcome.metadata).toEqual({
			selected: ['brave', 'tavily'],
			successful: [],
			failed: [
				{ provider: 'brave', type: ErrorType.AUTH_ERROR },
				{ provider: 'tavily', type: ErrorType.API_ERROR },
			],
			timed_out: [],
		});
		expect(serialized(outcome)).not.toContain(SECRET);
	});

	it('deduplicates selected providers and preserves first-call order', async () => {
		const outcome = await settle_provider_calls([
			{
				provider: 'tavily',
				run: async () => [{ title: 'first' }],
			},
			{
				provider: 'brave',
				run: async () => [{ title: 'second' }],
			},
			{
				provider: 'tavily',
				run: async () => [{ title: 'duplicate' }],
			},
		]);

		expect(outcome.metadata.selected).toEqual(['tavily', 'brave']);
		expect(outcome.values).toEqual([
			[{ title: 'first' }],
			[{ title: 'second' }],
		]);
	});

	it('normalizes a string or list into unique selected ids', () => {
		expect(normalize_provider_selection('brave')).toEqual(['brave']);
		expect(
			normalize_provider_selection(['tavily', 'brave', 'tavily']),
		).toEqual(['tavily', 'brave']);
	});

	it('keeps the single-provider result shape', async () => {
		await expect(
			run_selected_providers('brave', async () => [
				{ title: 'solo' },
			]),
		).resolves.toEqual([{ title: 'solo' }]);
	});

	it('wraps multi-provider calls with flattened results and metadata', async () => {
		const payload = await run_selected_providers(
			['brave', 'tavily'],
			async (id) => {
				if (id === 'tavily') {
					throw new ProviderError(
						ErrorType.AUTH_ERROR,
						`Invalid API key ${SECRET}`,
						'tavily',
					);
				}
				return [{ title: 'brave-hit' }];
			},
		);

		expect(payload).toEqual({
			results: [{ title: 'brave-hit' }],
			metadata: {
				selected: ['brave', 'tavily'],
				successful: ['brave'],
				failed: [{ provider: 'tavily', type: ErrorType.AUTH_ERROR }],
				timed_out: [],
			},
		});
		expect(serialized(payload)).not.toContain(SECRET);
	});

	it('attaches preempted skips without treating them as selected', async () => {
		const outcome = await settle_provider_calls(
			[
				{
					provider: 'brave',
					run: async () => [{ title: 'ok' }],
				},
			],
			{ preempted: ['kagi'] },
		);

		expect(outcome.metadata.selected).toEqual(['brave']);
		expect(outcome.metadata.preempted).toEqual(['kagi']);
	});
});
