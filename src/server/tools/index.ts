import { McpServer } from 'tmcp';
import type { GenericSchema } from 'valibot';
import {
	get_available_providers as get_ai_providers,
	initialize_ai_search,
	register_ai_search,
} from './ai_search.js';
import {
	get_available as get_github_providers,
	initialize_github_search,
	register_github_search,
} from './github_search.js';
import {
	get_available_providers as get_extract_providers,
	initialize_web_extract,
	register_web_extract,
} from './web_extract.js';
import {
	get_available_providers as get_search_providers,
	initialize_web_search,
	register_web_search,
} from './web_search.js';

// Track available providers by category for the status resource
export const available_providers = {
	search: new Set<string>(),
	ai_response: new Set<string>(),
	processing: new Set<string>(),
};

export const initialize_providers = () => {
	if (initialize_web_search()) {
		for (const p of get_search_providers())
			available_providers.search.add(p);
	}

	if (initialize_github_search()) {
		for (const p of get_github_providers())
			available_providers.search.add(p);
	}

	if (initialize_ai_search()) {
		for (const p of get_ai_providers())
			available_providers.ai_response.add(p);
	}

	if (initialize_web_extract()) {
		for (const p of get_extract_providers())
			available_providers.processing.add(p);
	}

	// Log available providers
	console.error('Available providers:');
	if (available_providers.search.size > 0) {
		console.error(
			`- Search: ${Array.from(available_providers.search).join(', ')}`,
		);
	} else {
		console.error('- Search: None available (missing API keys)');
	}

	if (available_providers.ai_response.size > 0) {
		console.error(
			`- AI Response: ${Array.from(available_providers.ai_response).join(', ')}`,
		);
	} else {
		console.error('- AI Response: None available (missing API keys)');
	}

	if (available_providers.processing.size > 0) {
		console.error(
			`- Processing: ${Array.from(available_providers.processing).join(', ')}`,
		);
	} else {
		console.error('- Processing: None available (missing API keys)');
	}
};

export const register_tools = (server: McpServer<GenericSchema>) => {
	register_web_search(server);
	register_github_search(server);
	register_ai_search(server);
	register_web_extract(server);
};
