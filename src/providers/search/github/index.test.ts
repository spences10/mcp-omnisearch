import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from 'vitest';

const search = vi.hoisted(() => ({
	code: vi.fn(),
	repos: vi.fn(),
	users: vi.fn(),
}));

vi.mock('octokit', () => ({
	Octokit: class {
		rest = { search };
	},
}));

describe('GitHubSearchProvider', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.stubEnv('GITHUB_API_KEY', 'test-github-key');
		search.code.mockReset();
		search.repos.mockReset();
		search.users.mockReset();
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		vi.restoreAllMocks();
	});

	it('maps code search text matches into snippets', async () => {
		search.code.mockResolvedValue({
			data: {
				items: [
					{
						name: 'index.ts',
						path: 'src/index.ts',
						html_url: 'https://github.test/file',
						score: 9,
						repository: {
							full_name: 'owner/repo',
							html_url: 'https://github.test/owner/repo',
						},
						text_matches: [
							{ fragment: 'first' },
							{ fragment: 'second' },
						],
					},
				],
			},
		});
		const { GitHubSearchProvider } = await import('./index.js');

		await expect(
			new GitHubSearchProvider().search_code({
				query: 'term',
				limit: 1,
			}),
		).resolves.toMatchObject([
			{
				title: 'owner/repo/src/index.ts',
				url: 'https://github.test/file',
				snippet: 'first ... second',
				score: 9,
				metadata: { search_type: 'code', repository: 'owner/repo' },
			},
		]);
	});

	it('maps repository search metadata', async () => {
		search.repos.mockResolvedValue({
			data: {
				items: [
					{
						full_name: 'owner/repo',
						html_url: 'https://github.test/owner/repo',
						description: 'Description',
						stargazers_count: 10,
						forks_count: 2,
						pushed_at: '2026-01-01T00:00:00Z',
						language: 'TypeScript',
						score: 4,
					},
				],
			},
		});
		const { GitHubSearchProvider } = await import('./index.js');

		await expect(
			new GitHubSearchProvider().search_repositories({
				query: 'repo',
			}),
		).resolves.toMatchObject([
			{
				title: 'owner/repo',
				snippet: expect.stringContaining('TypeScript'),
				metadata: { search_type: 'repository', stars: 10 },
			},
		]);
	});

	it('maps user search fallbacks', async () => {
		search.users.mockResolvedValue({
			data: {
				items: [
					{
						login: 'octocat',
						html_url: 'https://github.test/octocat',
						type: 'User',
						score: 3,
					},
				],
			},
		});
		const { GitHubSearchProvider } = await import('./index.js');

		await expect(
			new GitHubSearchProvider().search_users({ query: 'octocat' }),
		).resolves.toMatchObject([
			{
				title: 'octocat',
				snippet: 'GitHub user: octocat • User',
				metadata: { search_type: 'user', username: 'octocat' },
			},
		]);
	});
});
