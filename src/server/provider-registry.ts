import { ErrorType, ProviderError } from '../common/types.js';
import { is_api_key_valid } from '../common/validation.js';

export type ProviderCategory =
	| 'search'
	| 'ai_response'
	| 'processing';

export interface ProviderDefinition<T> {
	id: string;
	name: string;
	category: ProviderCategory;
	api_key: string | undefined;
	api_key_name?: string;
	create: () => T;
	modes?: readonly string[];
	capabilities?: readonly string[];
}

export interface RegisteredProvider<T> {
	id: string;
	name: string;
	category: ProviderCategory;
	instance: T;
	modes?: readonly string[];
	capabilities?: readonly string[];
}

export class ProviderRegistry<T> {
	private readonly providers = new Map<
		string,
		RegisteredProvider<T>
	>();
	private readonly missing_api_key_names = new Set<string>();

	clear() {
		this.providers.clear();
		this.missing_api_key_names.clear();
	}

	register(definition: ProviderDefinition<T>) {
		const api_key_name = definition.api_key_name ?? definition.name;

		if (!definition.api_key || definition.api_key.trim() === '') {
			if (!this.missing_api_key_names.has(api_key_name)) {
				is_api_key_valid(definition.api_key, api_key_name);
				this.missing_api_key_names.add(api_key_name);
			}
			return;
		}

		if (!is_api_key_valid(definition.api_key, api_key_name)) {
			return;
		}

		this.providers.set(definition.id, {
			id: definition.id,
			name: definition.name,
			category: definition.category,
			instance: definition.create(),
			modes: definition.modes,
			capabilities: definition.capabilities,
		});
	}

	get(id: string): T | undefined {
		return this.providers.get(id)?.instance;
	}

	require(
		id: string,
		tool_name: string,
		message = `Provider "${id}" is not available. Available: ${this.ids().join(', ')}`,
	): T {
		const provider = this.get(id);
		if (!provider) {
			throw new ProviderError(
				ErrorType.INVALID_INPUT,
				message,
				tool_name,
			);
		}

		return provider;
	}

	ids(): string[] {
		return Array.from(this.providers.keys());
	}

	names(): string[] {
		return Array.from(
			new Set(
				Array.from(this.providers.values()).map(
					(provider) => provider.name,
				),
			),
		);
	}

	entries(): RegisteredProvider<T>[] {
		return Array.from(this.providers.values());
	}

	get size() {
		return this.providers.size;
	}
}
