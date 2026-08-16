// Known content mirrors and SEO scrapers that republish Stack
// Overflow, GitHub, and documentation. These add no information over
// the canonical source and are dropped rather than demoted.
export const SPAM_MIRROR_DOMAINS = [
	// Stack Overflow / Q&A scrapers
	'newbedev.com',
	'stackoom.com',
	'stackovergo.com',
	'syntaxfix.com',
	'copyprogramming.com',
	'devcodef1.com',
	'exceptionshub.com',
	'code-examples.net',
	'i-harness.com',
	'fixmycodeerror.com',
	'stacklesson.com',
	// GitHub issue/readme mirrors
	'githubmemory.com',
	'gitmemory.com',
	'issueexplorer.com',
	'bleepcoder.com',
	'gitanswer.com',
	// Documentation mirrors
	'w3cub.com',
	// Generic AI/SEO content farms
	'aizolo.com',
] as const;
