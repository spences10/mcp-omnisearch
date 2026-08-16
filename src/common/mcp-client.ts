import { spawn } from 'node:child_process';
import type { ResolvedMcpBackend } from '../config/mcp-backends.js';
import { http_json_result } from './http.js';
import { ErrorType, ProviderError } from './types.js';

const PROTOCOL_VERSION = '2025-03-26';
const CLIENT_INFO = {
	name: 'mcp-omnisearch',
	version: 'mcp-backend',
};

const is_record = (
	value: unknown,
): value is Record<string, unknown> =>
	typeof value === 'object' &&
	value !== null &&
	!Array.isArray(value);

const try_parse_json = (text: string): unknown => {
	try {
		return JSON.parse(text) as unknown;
	} catch {
		return undefined;
	}
};

const is_abort_error = (error: unknown): boolean =>
	typeof error === 'object' &&
	error !== null &&
	'name' in error &&
	(error.name === 'AbortError' || error.name === 'TimeoutError');

export const parse_mcp_response_body = (data: unknown): unknown => {
	if (typeof data === 'object' && data !== null) return data;
	if (typeof data !== 'string') return data;

	const trimmed = data.trim();
	if (
		trimmed.startsWith('event:') ||
		trimmed.startsWith('data:') ||
		trimmed.includes('\ndata:')
	) {
		const payloads: unknown[] = [];
		for (const line of data.split(/\r?\n/)) {
			if (!line.startsWith('data:')) continue;
			const payload = line.slice(5).trim();
			if (!payload || payload === '[DONE]') continue;
			const parsed = try_parse_json(payload);
			if (parsed !== undefined) payloads.push(parsed);
		}
		for (let index = payloads.length - 1; index >= 0; index -= 1) {
			const candidate = payloads[index];
			if (
				is_record(candidate) &&
				('result' in candidate || 'error' in candidate)
			) {
				return candidate;
			}
		}
		return payloads.at(-1);
	}

	return try_parse_json(trimmed) ?? data;
};

export const unwrap_jsonrpc_result = (
	message: unknown,
	provider: string,
): unknown => {
	if (!is_record(message)) {
		throw new ProviderError(
			ErrorType.MALFORMED_RESPONSE,
			'Downstream MCP returned a non-object JSON-RPC message',
			provider,
		);
	}
	if (message.error !== undefined) {
		const error = message.error;
		const text =
			is_record(error) && typeof error.message === 'string'
				? error.message
				: 'Downstream MCP JSON-RPC error';
		throw new ProviderError(
			ErrorType.PROVIDER_ERROR,
			text,
			provider,
			{
				mcp_error: error,
			},
		);
	}
	return message.result;
};

const encode_stdio_message = (message: unknown): Buffer => {
	const json = JSON.stringify(message);
	const body = Buffer.from(json, 'utf8');
	return Buffer.concat([
		Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, 'utf8'),
		body,
	]);
};

class ContentLengthReader {
	private buffer = Buffer.alloc(0);

	push(chunk: Buffer) {
		this.buffer = Buffer.concat([this.buffer, chunk]);
	}

	try_read(): { ok: true; value: unknown } | { ok: false } {
		const header_end = this.buffer.indexOf('\r\n\r\n');
		if (header_end === -1) return { ok: false };
		const header = this.buffer
			.subarray(0, header_end)
			.toString('utf8');
		const match = header.match(/Content-Length:\s*(\d+)/i);
		if (!match) {
			throw new Error('stdio MCP message is missing Content-Length');
		}
		const length = Number(match[1]);
		const start = header_end + 4;
		if (this.buffer.length < start + length) return { ok: false };
		const body = this.buffer
			.subarray(start, start + length)
			.toString('utf8');
		this.buffer = this.buffer.subarray(start + length);
		return { ok: true, value: JSON.parse(body) as unknown };
	}
}

export interface McpToolCallInput {
	backend: ResolvedMcpBackend;
	tool: string;
	arguments: Record<string, unknown>;
}

const initialize_params = {
	protocolVersion: PROTOCOL_VERSION,
	capabilities: {},
	clientInfo: CLIENT_INFO,
};

const post_http_mcp = async (
	backend: ResolvedMcpBackend,
	body: unknown,
	session_id?: string,
	expected_statuses?: number[],
) => {
	if (!backend.transport_url) {
		throw new ProviderError(
			ErrorType.INVALID_INPUT,
			'HTTP MCP backend is missing transport_url',
			backend.id,
		);
	}

	try {
		const result = await http_json_result(
			backend.id,
			backend.transport_url,
			{
				method: 'POST',
				headers: {
					Accept: 'application/json, text/event-stream',
					'Content-Type': 'application/json',
					'MCP-Protocol-Version': PROTOCOL_VERSION,
					...backend.headers,
					...(session_id ? { 'Mcp-Session-Id': session_id } : {}),
				},
				body: JSON.stringify(body),
				signal: AbortSignal.timeout(backend.timeout),
				expectedStatuses: expected_statuses,
			},
		);
		return result;
	} catch (error) {
		if (is_abort_error(error)) {
			throw new ProviderError(
				ErrorType.TIMEOUT,
				`${backend.id} MCP request timed out`,
				backend.id,
				{ retryable: true },
			);
		}
		throw error;
	}
};

const call_http_mcp_tool = async (
	input: McpToolCallInput,
): Promise<unknown> => {
	const { backend } = input;
	const initialize = await post_http_mcp(backend, {
		jsonrpc: '2.0',
		id: 1,
		method: 'initialize',
		params: initialize_params,
	});
	unwrap_jsonrpc_result(
		parse_mcp_response_body(initialize.data),
		backend.id,
	);
	const session_id =
		initialize.headers.get('mcp-session-id') ?? undefined;

	await post_http_mcp(
		backend,
		{
			jsonrpc: '2.0',
			method: 'notifications/initialized',
		},
		session_id,
		[200, 202, 204],
	);

	const call = await post_http_mcp(
		backend,
		{
			jsonrpc: '2.0',
			id: 2,
			method: 'tools/call',
			params: {
				name: input.tool,
				arguments: input.arguments,
			},
		},
		session_id,
	);
	return unwrap_jsonrpc_result(
		parse_mcp_response_body(call.data),
		backend.id,
	);
};

const call_stdio_mcp_tool = async (
	input: McpToolCallInput,
): Promise<unknown> => {
	const { backend } = input;
	if (!backend.command || backend.command.length === 0) {
		throw new ProviderError(
			ErrorType.INVALID_INPUT,
			'stdio MCP backend is missing command',
			backend.id,
		);
	}

	const child = spawn(backend.command[0]!, backend.command.slice(1), {
		env: { ...process.env, ...backend.env },
		stdio: ['pipe', 'pipe', 'ignore'],
	});
	const reader = new ContentLengthReader();
	let pending:
		| {
				resolve: (value: unknown) => void;
				reject: (error: Error) => void;
		  }
		| undefined;

	const fail = (error: Error) => {
		pending?.reject(error);
		pending = undefined;
	};

	child.stdout?.on('data', (chunk: Buffer) => {
		try {
			reader.push(chunk);
			let message = reader.try_read();
			while (message.ok) {
				pending?.resolve(message.value);
				pending = undefined;
				message = reader.try_read();
			}
		} catch (error) {
			fail(
				error instanceof Error
					? error
					: new Error('Failed to parse stdio MCP message'),
			);
		}
	});
	child.on('error', (error) => fail(error));
	child.on('exit', (code) => {
		if (pending) {
			fail(
				new Error(
					`stdio MCP process exited before responding (${code ?? 'null'})`,
				),
			);
		}
	});

	const request = async (message: unknown): Promise<unknown> => {
		const response = new Promise<unknown>((resolve, reject) => {
			pending = { resolve, reject };
		});
		child.stdin?.write(encode_stdio_message(message));
		return response;
	};

	const timeout = setTimeout(() => {
		fail(
			new ProviderError(
				ErrorType.TIMEOUT,
				`${backend.id} MCP request timed out`,
				backend.id,
				{ retryable: true },
			),
		);
		child.kill('SIGTERM');
	}, backend.timeout);

	try {
		unwrap_jsonrpc_result(
			await request({
				jsonrpc: '2.0',
				id: 1,
				method: 'initialize',
				params: initialize_params,
			}),
			backend.id,
		);
		child.stdin?.write(
			encode_stdio_message({
				jsonrpc: '2.0',
				method: 'notifications/initialized',
			}),
		);
		return unwrap_jsonrpc_result(
			await request({
				jsonrpc: '2.0',
				id: 2,
				method: 'tools/call',
				params: {
					name: input.tool,
					arguments: input.arguments,
				},
			}),
			backend.id,
		);
	} catch (error) {
		if (error instanceof ProviderError) throw error;
		throw new ProviderError(
			ErrorType.API_ERROR,
			`Failed to call downstream MCP tool: ${
				error instanceof Error ? error.message : 'Unknown error'
			}`,
			backend.id,
		);
	} finally {
		clearTimeout(timeout);
		if (!child.killed) child.kill('SIGTERM');
	}
};

export const call_mcp_tool = async (
	input: McpToolCallInput,
): Promise<unknown> =>
	input.backend.kind === 'http'
		? call_http_mcp_tool(input)
		: call_stdio_mcp_tool(input);
