import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		globals: true,
		environment: 'jsdom',
		include: ['**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
		exclude: ['node_modules', 'dist', '.git'],
		coverage: {
			provider: 'v8',
			reporter: ['text', 'json', 'html'],
			exclude: [
				'node_modules/',
				'dist/',
				'**/*.d.ts',
				'**/*.config.*',
				'**/coverage/**',
			],
		},
		testTimeout: 5000,
		hookTimeout: 5000,
		teardownTimeout: 2000,
	},
	resolve: {
		alias: {
			'@': '/src',
		},
	},
});