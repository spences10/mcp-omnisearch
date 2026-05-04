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
	description?: string;
	tools?: readonly string[];
	modes?: readonly string[];
	capabilities?: readonly string[];
}

export interface ProviderStatus {
	id: string;
	name: string;
	category: ProviderCategory;
	status: 'available' | 'unavailable';
	api_key_name: string;
	description?: string;
	tools: readonly string[];
	modes: readonly string[];
	capabilities: readonly string[];
	unavailable_reason?: 'missing_api_key';
}

export interface RegisteredProvider<T> {
	id: string;
	name: string;
	category: ProviderCategory;
	instance: T;
	description?: string;
	tools: readonly string[];
	modes: readonly string[];
	capabilities: readonly string[];
}

export class ProviderRegistry<T> {
	private readonly providers = new Map<
		string,
		RegisteredProvider<T>
	>();
	private readonly statuses = new Map<string, ProviderStatus>();
	private readonly missing_api_key_names = new Set<string>();

	clear() {
		this.providers.clear();
		this.statuses.clear();
		this.missing_api_key_names.clear();
	}

	register(definition: ProviderDefinition<T>) {
		const api_key_name = definition.api_key_name ?? definition.name;
		const base_status = {
			id: definition.id,
			name: definition.name,
			category: definition.category,
			api_key_name,
			description: definition.description,
			tools: definition.tools ?? [],
			modes: definition.modes ?? [],
			capabilities: definition.capabilities ?? [],
		};

		if (!definition.api_key || definition.api_key.trim() === '') {
			if (!this.missing_api_key_names.has(api_key_name)) {
				is_api_key_valid(definition.api_key, api_key_name);
				this.missing_api_key_names.add(api_key_name);
			}
			this.statuses.set(definition.id, {
				...base_status,
				status: 'unavailable',
				unavailable_reason: 'missing_api_key',
			});
			return;
		}

		if (!is_api_key_valid(definition.api_key, api_key_name)) {
			this.statuses.set(definition.id, {
				...base_status,
				status: 'unavailable',
				unavailable_reason: 'missing_api_key',
			});
			return;
		}

		const instance = definition.create();
		this.providers.set(definition.id, {
			...base_status,
			instance,
			description:
				definition.description ??
				(instance as { description?: string }).description,
		});
		this.statuses.set(definition.id, {
			...base_status,
			status: 'available',
			description:
				definition.description ??
				(instance as { description?: string }).description,
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

	status_entries(): ProviderStatus[] {
		return Array.from(this.statuses.values());
	}

	get size() {
		return this.providers.size;
	}
}
