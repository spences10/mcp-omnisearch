#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { parse } from 'yaml';
import {
	documented_provider_schemas,
	provider_schema_sources,
} from './provider-schema-sources.ts';

type ObjectValue = Record<string, unknown>;
const object = (value: unknown): ObjectValue => {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw new Error('Expected a schema object');
	}
	return value as ObjectValue;
};

const documents = new Map<string, ObjectValue>();
async function load_document(url: string) {
	const cached = documents.get(url);
	if (cached) return cached;
	const response = await fetch(url, {
		signal: AbortSignal.timeout(30_000),
	});
	if (!response.ok) throw new Error(`${url}: ${response.status}`);
	const text = await response.text();
	const yaml = text.match(/````yaml[^\n]*\n([\s\S]*?)\n````/);
	const document = object(yaml ? parse(yaml[1]) : JSON.parse(text));
	documents.set(url, document);
	return document;
}

function resolve(document: ObjectValue, value: unknown): ObjectValue {
	const entry = object(value);
	if (typeof entry.$ref !== 'string') return entry;
	if (!entry.$ref.startsWith('#/')) {
		throw new Error(`External reference: ${entry.$ref}`);
	}
	let resolved: unknown = document;
	for (const segment of entry.$ref.slice(2).split('/')) {
		resolved =
			object(resolved)[
				segment.replace(/~1/g, '/').replace(/~0/g, '~')
			];
	}
	return object(resolved);
}

// Keep local references (including recursive ones) in a self-contained $defs
// closure. Drop documentation examples, not request validation constraints.
function input_schema(document: ObjectValue, schema: ObjectValue) {
	const definitions: ObjectValue = {};
	const refs = new Map<string, string>();
	function visit(value: unknown): unknown {
		if (Array.isArray(value)) return value.map(visit);
		if (!value || typeof value !== 'object') return value;
		const result: ObjectValue = {};
		for (const [key, child] of Object.entries(value)) {
			if (
				[
					'example',
					'examples',
					'externalDocs',
					'xml',
					'$schema',
					'id',
				].includes(key)
			)
				continue;
			if (
				[
					'properties',
					'patternProperties',
					'$defs',
					'definitions',
				].includes(key)
			) {
				result[key] = Object.fromEntries(
					Object.entries(object(child)).map(([name, schema]) => [
						name,
						visit(schema),
					]),
				);
			} else if (key === '$ref' && typeof child === 'string') {
				let name = refs.get(child);
				if (!name) {
					name = `schema_${refs.size}`;
					refs.set(child, name);
					definitions[name] = visit(
						resolve(document, { $ref: child }),
					);
				}
				result.$ref = `#/$defs/${name}`;
			} else {
				result[key] =
					key === 'description' && typeof child === 'string'
						? child.slice(0, 500)
						: visit(child);
			}
		}
		return result;
	}
	const result = object(visit(schema));
	if (refs.size) result.$defs = definitions;
	return result;
}

const operations: ObjectValue[] = [...documented_provider_schemas];
for (const source of provider_schema_sources) {
	for (const operation of source.operations) {
		const [name, method, path] = operation;
		const slug = operation.length > 3 ? operation[3] : name;
		const url = source.url.replace('{operation}', slug ?? name);
		const document = await load_document(url);
		const path_item = object(object(document.paths)[path]);
		const endpoint = resolve(document, path_item[method]);
		const query: string[] = [];
		const properties: ObjectValue = {};
		const required: string[] = [];
		for (const parameter of [
			...((path_item.parameters ?? []) as unknown[]),
			...((endpoint.parameters ?? []) as unknown[]),
		]) {
			const param = resolve(document, parameter);
			if (param.in !== 'path' && param.in !== 'query') continue;
			if (typeof param.name !== 'string')
				throw new Error('Unnamed parameter');
			if (
				param.style &&
				param.style !== 'form' &&
				param.style !== 'simple'
			) {
				throw new Error(
					`Unsupported parameter style: ${JSON.stringify(param.style)}`,
				);
			}
			properties[param.name] = param.schema;
			if (param.required) required.push(param.name);
			if (param.in === 'query') query.push(param.name);
		}
		let schema: ObjectValue = {
			type: 'object',
			properties,
			required,
		};
		if (endpoint.requestBody) {
			if (Object.keys(properties).length)
				throw new Error(
					'Mixed body and parameters are not supported',
				);
			const body = resolve(document, endpoint.requestBody);
			const content = object(body.content);
			schema = structuredClone(
				resolve(document, object(content['application/json']).schema),
			);
		}
		// Authentication is host-owned, never a generated function argument.
		if (schema.properties) delete object(schema.properties).api_key;
		if (Array.isArray(schema.required)) {
			schema.required = schema.required.filter(
				(key) => key !== 'api_key',
			);
		}
		schema.unevaluatedProperties = false;
		operations.push({
			provider: source.provider,
			source: url,
			name: `${source.provider}_${name}`,
			description: (typeof endpoint.summary === 'string'
				? endpoint.summary
				: name
			).slice(0, 500),
			method: method.toUpperCase(),
			path,
			query,
			inputSchema: input_schema(document, schema),
		});
	}
}

operations.sort((a, b) =>
	String(a.name).localeCompare(String(b.name)),
);
const sources = [...documents].map(([url, document]) => ({
	url,
	sha256: createHash('sha256')
		.update(JSON.stringify(document))
		.digest('hex'),
}));
const destination = new URL(
	'../src/codemode/provider-schemas.json',
	import.meta.url,
);
await mkdir(new URL('../src/codemode/', import.meta.url), {
	recursive: true,
});
await writeFile(
	destination,
	`${JSON.stringify({ sources, operations }, null, '\t')}\n`,
);
execFileSync('pnpm', ['exec', 'vp', 'fmt', destination.pathname], {
	stdio: 'inherit',
});
console.log(
	`Generated ${operations.length} provider functions in ${destination.pathname}`,
);
