/**
 * Tool call traces: what the model asked Drishti MCP for, how long each call
 * took and what came back. The server times every MCP call and streams the
 * timings as message metadata; the trace panel joins them with the tool parts
 * already in the message.
 */

import type { UIMessage } from "ai";
import type { QueryUsageMetadata } from "~/types";

export interface ToolCallTiming {
	/** Epoch ms when the MCP request was sent. */
	startedAt: number;
	/** Round trip to the MCP server, measured on the app server. */
	durationMs: number;
	/** Size of the text the server returned. */
	responseBytes: number;
	isError?: boolean;
}

export type ToolTraceMessageMetadata = {
	toolTimings?: Record<string, ToolCallTiming>;
};

function sortKeys(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(sortKeys);
	if (value && typeof value === "object") {
		return Object.fromEntries(
			Object.entries(value)
				.sort(([a], [b]) => a.localeCompare(b))
				.map(([k, v]) => [k, sortKeys(v)]),
		);
	}
	return value;
}

function parseArgs(args: unknown): unknown {
	if (typeof args !== "string") return args ?? {};
	try {
		return JSON.parse(args);
	} catch {
		return args;
	}
}

/** Same key for the same tool and arguments, whatever the key order. */
export function toolCallKey(toolName: string, args: unknown): string {
	return `${toolName}:${JSON.stringify(sortKeys(parseArgs(args)))}`;
}

/**
 * Collects MCP call timings on the server. The MCP client never sees the
 * model's tool call id, so calls are matched to stream parts by tool name and
 * arguments; identical calls are matched in order.
 */
export class ToolTimingRecorder {
	private readonly byKey = new Map<string, ToolCallTiming[]>();

	record = (toolName: string, args: unknown, timing: ToolCallTiming) => {
		const key = toolCallKey(toolName, args);
		const queue = this.byKey.get(key) ?? [];
		queue.push(timing);
		this.byKey.set(key, queue);
	};

	take(toolName: string, args: unknown): ToolCallTiming | undefined {
		return this.byKey.get(toolCallKey(toolName, args))?.shift();
	}
}

type UiChunk = {
	type?: string;
	toolCallId?: string;
	toolName?: string;
	input?: unknown;
};

/**
 * Passes UI stream chunks through and, after each tool result, adds a
 * message-metadata chunk with that call's timing. Metadata chunks are merged
 * on the client, so the timings build up on the assistant message.
 */
export function withToolTimings(
	uiStream: ReadableStream,
	recorder: ToolTimingRecorder,
): ReadableStream {
	const reader = uiStream.getReader();
	const calls = new Map<string, { toolName: string; input: unknown }>();

	return new ReadableStream({
		async start(controller) {
			try {
				while (true) {
					const { done, value } = await reader.read();
					if (done) break;
					controller.enqueue(value);

					const chunk = value as UiChunk;
					if (
						chunk.type === "tool-input-available" &&
						chunk.toolCallId &&
						chunk.toolName
					) {
						calls.set(chunk.toolCallId, {
							toolName: chunk.toolName,
							input: chunk.input,
						});
					}
					if (chunk.type === "tool-output-available" && chunk.toolCallId) {
						const call = calls.get(chunk.toolCallId);
						const timing = call && recorder.take(call.toolName, call.input);
						if (timing) {
							controller.enqueue({
								type: "message-metadata",
								messageMetadata: {
									toolTimings: { [chunk.toolCallId]: timing },
								},
							});
						}
					}
				}
				controller.close();
			} catch (error) {
				controller.error(error);
			}
		},
		cancel() {
			void reader.cancel();
		},
	});
}

/** Hide API keys in anything shown on screen, e.g. citation links. */
export function redactSecrets(text: string): string {
	return text
		.replace(/([?&]api_key=)[^\s"'&)\]]+/g, "$1•••")
		.replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]{8,}/g, "$1•••");
}

const URL_PATTERN = /https?:\/\/[^\s"'<>)\]]+|\/api\/citation\/[^\s"'<>)\]]+/g;

/** Source links in a tool response, de-duplicated, keys hidden. */
export function extractSourceLinks(text: string, limit = 8): string[] {
	const links = new Set<string>();
	for (const match of text.matchAll(URL_PATTERN)) {
		links.add(redactSecrets(match[0].replace(/[.,;]+$/, "")));
		if (links.size >= limit) break;
	}
	return [...links];
}

/** The JSON-RPC body the MCP client sends for a tool call (request id left out). */
export function toJsonRpcRequest(toolName: string, input: unknown) {
	return {
		jsonrpc: "2.0",
		method: "tools/call",
		params: { name: toolName, arguments: parseArgs(input) },
	};
}

export type JsonTokenKind =
	| "key"
	| "string"
	| "number"
	| "literal"
	| "punctuation"
	| "text";

export interface JsonToken {
	kind: JsonTokenKind;
	text: string;
}

const JSON_TOKEN =
	/("(?:\\.|[^"\\])*")(\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|[{}[\],]/g;

/**
 * Splits pretty-printed JSON into coloured tokens. Lenient on purpose: a
 * truncated preview or plain text still renders, just with less colour.
 */
export function tokenizeJson(text: string): JsonToken[] {
	const tokens: JsonToken[] = [];
	let last = 0;
	for (const match of text.matchAll(JSON_TOKEN)) {
		const index = match.index ?? 0;
		if (index > last)
			tokens.push({ kind: "text", text: text.slice(last, index) });
		const [whole, quoted, colon] = match;
		if (quoted && colon) {
			tokens.push({ kind: "key", text: quoted });
			tokens.push({ kind: "punctuation", text: colon });
		} else if (quoted) {
			tokens.push({ kind: "string", text: quoted });
		} else if (/^[{}[\],]$/.test(whole)) {
			tokens.push({ kind: "punctuation", text: whole });
		} else if (/^(?:true|false|null)$/.test(whole)) {
			tokens.push({ kind: "literal", text: whole });
		} else {
			tokens.push({ kind: "number", text: whole });
		}
		last = index + whole.length;
	}
	if (last < text.length) tokens.push({ kind: "text", text: text.slice(last) });
	return tokens;
}

export type TraceToolPart = {
	toolCallId: string;
	toolName: string;
	state?: string;
	input?: unknown;
	output?: unknown;
	errorText?: string;
};

export interface TraceCall {
	part: TraceToolPart;
	timing?: ToolCallTiming;
}

export interface TraceTurn {
	id: string;
	question: string;
	calls: TraceCall[];
	usage?: QueryUsageMetadata;
	/** Sum of MCP round trips. Parallel calls overlap, so this can exceed wall time. */
	totalMcpMs: number;
}

function isToolPart(part: unknown): part is TraceToolPart & { type: string } {
	if (!part || typeof part !== "object") return false;
	const { type, toolCallId } = part as { type?: unknown; toolCallId?: unknown };
	return (
		typeof type === "string" &&
		typeof toolCallId === "string" &&
		(type === "dynamic-tool" || type.startsWith("tool-"))
	);
}

function partToolName(part: TraceToolPart & { type: string }): string {
	if (typeof part.toolName === "string") return part.toolName;
	return part.type.replace(/^tool-/, "");
}

function messageText(message: UIMessage): string {
	return message.parts
		.filter((p): p is { type: "text"; text: string } => p.type === "text")
		.map((p) => p.text)
		.join("\n")
		.trim();
}

/** One trace turn per assistant reply that called tools, newest first. */
export function buildTraceTurns(messages: UIMessage[]): TraceTurn[] {
	const turns: TraceTurn[] = [];
	let question = "";

	for (const message of messages) {
		if (message.role === "user") {
			question = messageText(message);
			continue;
		}
		if (message.role !== "assistant") continue;

		const metadata = (message.metadata ?? {}) as ToolTraceMessageMetadata & {
			queryUsage?: QueryUsageMetadata;
		};
		const timings = metadata.toolTimings ?? {};
		const calls = (message.parts as unknown[])
			.filter(isToolPart)
			.map((part) => ({
				part: { ...part, toolName: partToolName(part) },
				timing: timings[part.toolCallId],
			}));
		if (calls.length === 0) continue;

		turns.push({
			id: message.id,
			question,
			calls,
			usage: metadata.queryUsage,
			totalMcpMs: calls.reduce(
				(sum, c) => sum + (c.timing?.durationMs ?? 0),
				0,
			),
		});
	}

	return turns.reverse();
}

export function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDuration(ms: number): string {
	return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(2)} s`;
}
