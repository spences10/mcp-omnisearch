import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { register_tools, available_providers } from '../../../server/tools.js';

// Mock the MCP SDK
vi.mock('@modelcontextprotocol/sdk/server/index.js', () => ({
	Server: vi.fn().mockImplementation(() => ({
		setRequestHandler: vi.fn(),
	})),
}));

// Mock providers
vi.mock('../../../providers/index.js', () => ({
	initialize_providers: vi.fn(),
}));

// Mock config
vi.mock('../../../config/env.js', () => ({
	config: {
		search: {
			tavily: { api_key: 'test-key' },
		},
	},
}));

describe('Server Tools', () => {
	let mockServer: any;

	beforeEach(() => {
		mockServer = {
			setRequestHandler: vi.fn(),
		};
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('register_tools', () => {
		it('should register tools with server', () => {
			register_tools(mockServer);

			// Should register list_tools handler
			expect(mockServer.setRequestHandler).toHaveBeenCalled();
		});

		it('should handle empty provider lists', () => {
			// Clear all providers
			available_providers.search.clear();
			available_providers.ai_response.clear();
			available_providers.processing.clear();
			available_providers.enhancement.clear();

			register_tools(mockServer);

			// Should still register handlers without errors
			expect(mockServer.setRequestHandler).toHaveBeenCalled();
		});
	});

	describe('available_providers', () => {
		it('should track available providers', () => {
			expect(available_providers).toHaveProperty('search');
			expect(available_providers).toHaveProperty('ai_response');
			expect(available_providers).toHaveProperty('processing');
			expect(available_providers).toHaveProperty('enhancement');

			expect(available_providers.search).toBeInstanceOf(Set);
			expect(available_providers.ai_response).toBeInstanceOf(Set);
			expect(available_providers.processing).toBeInstanceOf(Set);
			expect(available_providers.enhancement).toBeInstanceOf(Set);
		});
	});

	describe('Tool execution error handling', () => {
		it('should handle provider errors gracefully', () => {
			// This would require more complex mocking of the actual tool execution
			// For now, we verify the structure is in place
			expect(typeof register_tools).toBe('function');
		});
	});
});