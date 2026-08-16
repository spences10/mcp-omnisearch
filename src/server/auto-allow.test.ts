import { describe, expect, it } from 'vitest';
import {
	build_auto_allow_quality_report,
	select_for_automatic_use,
	type AutoAllowCandidate,
} from './auto-allow.js';

const candidate = (
	id: string,
	auto_allow: boolean,
	name = id,
): AutoAllowCandidate => ({ id, name, auto_allow });

const cheap = [
	candidate('tavily', true),
	candidate('brave', true),
	candidate('kagi', true),
];

const mixed = [
	...cheap,
	candidate('parallel', false),
	candidate('querit', false),
];

describe('select_for_automatic_use', () => {
	it('keeps current cheap engines in the automatic pool', () => {
		expect(select_for_automatic_use(cheap)).toEqual({
			selected: cheap,
			auto_allow_excluded: [],
		});
	});

	it('skips gated providers for auto routing', () => {
		const { selected, auto_allow_excluded } =
			select_for_automatic_use(mixed);

		expect(selected.map((entry) => entry.id)).toEqual([
			'tavily',
			'brave',
			'kagi',
		]);
		expect(auto_allow_excluded).toEqual(['parallel', 'querit']);
	});

	it('skips gated providers for fan-out', () => {
		const fan_out = select_for_automatic_use(mixed);

		expect(fan_out.selected.map((entry) => entry.id)).not.toContain(
			'parallel',
		);
		expect(fan_out.auto_allow_excluded).toContain('parallel');
	});

	it('skips gated providers for failover', () => {
		const remaining = mixed.filter((entry) => entry.id !== 'tavily');
		const failover = select_for_automatic_use(remaining);

		expect(failover.selected.map((entry) => entry.id)).toEqual([
			'brave',
			'kagi',
		]);
		expect(failover.auto_allow_excluded).toEqual([
			'parallel',
			'querit',
		]);
	});

	it('includes a gated provider when the call opts in', () => {
		const opted = select_for_automatic_use(mixed, {
			opt_in: ['parallel'],
		});

		expect(opted.selected.map((entry) => entry.id)).toEqual([
			'tavily',
			'brave',
			'kagi',
			'parallel',
		]);
		expect(opted.auto_allow_excluded).toEqual(['querit']);
	});
});

describe('build_auto_allow_quality_report', () => {
	it('lists auto_allow_excluded names', () => {
		expect(build_auto_allow_quality_report(mixed)).toEqual({
			auto_allow_excluded: ['parallel', 'querit'],
		});
	});
});
