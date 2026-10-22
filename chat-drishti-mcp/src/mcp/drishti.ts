import { type CallToolResult, MCPServerStreamableHttp } from "@openai/agents";
import { hideCitationKeys } from "~/lib/citations";
import type { ToolCallTiming } from "~/lib/tool-trace";

export const DRISHTI_MCP_URL =
	process.env.DRISHTI_MCP_URL ?? "https://mcp.drishti.manasija.in";

/**
 * Documentation operations the market-data agent should not run.
 *
 * Drishti MCP runs most operations through execute_tool, which a listTools
 * filter cannot see, so these names are also rejected at call time.
 */
export const DRISHTI_DISABLED_OPERATIONS = ["search_docs", "get_doc"] as const;

const disabledOperations = new Set<string>(DRISHTI_DISABLED_OPERATIONS);

export type ToolCallListener = (
	toolName: string,
	args: Record<string, unknown> | null,
	timing: ToolCallTiming,
) => void;

function responseBytes(result: CallToolResult): number {
	const encoder = new TextEncoder();
	return result.content.reduce(
		(sum, item) =>
			sum +
			(item.type === "text" && typeof item.text === "string"
				? encoder.encode(item.text).length
				: 0),
		0,
	);
}

class DrishtiMcpServer extends MCPServerStreamableHttp {
	/** True when using the server's shared key, which must not leak in links. */
	hideKeyInLinks = false;
	/** Called after every tool call with its timing, for the trace panel. */
	onToolCall?: ToolCallListener;

	override async callToolResult(
		toolName: string,
		args: Record<string, unknown> | null,
		meta?: Record<string, unknown> | null,
	): Promise<CallToolResult> {
		const startedAt = Date.now();
		const result = await this.runToolCall(toolName, args, meta);
		this.onToolCall?.(toolName, args, {
			startedAt,
			durationMs: Date.now() - startedAt,
			responseBytes: responseBytes(result),
			...(result.isError ? { isError: true } : {}),
		});
		return result;
	}

	private async runToolCall(
		toolName: string,
		args: Record<string, unknown> | null,
		meta?: Record<string, unknown> | null,
	): Promise<CallToolResult> {
		const operation = toolName === "execute_tool" ? args?.name : toolName;
		if (typeof operation === "string" && disabledOperations.has(operation)) {
			// Return an error result rather than throwing so the model can recover.
			return {
				content: [
					{
						type: "text",
						text: `${operation} is not available in this chat. Use a market data operation instead.`,
					},
				],
				isError: true,
			};
		}
		const result = await super.callToolResult(toolName, args, meta);
		if (!this.hideKeyInLinks) return result;
		return {
			...result,
			content: result.content.map((item) =>
				item.type === "text" && typeof item.text === "string"
					? { ...item, text: hideCitationKeys(item.text) }
					: item,
			),
		};
	}
}

export function createDrishtiMcpServer(
	apiKey?: string,
	onToolCall?: ToolCallListener,
) {
	const server = new DrishtiMcpServer({
		url: DRISHTI_MCP_URL,
		name: "Drishti",
		cacheToolsList: true,
		toolFilter: {
			blockedToolNames: [...DRISHTI_DISABLED_OPERATIONS],
		},
		...(apiKey
			? {
					requestInit: {
						headers: {
							Authorization: `Bearer ${apiKey}`,
						},
					},
				}
			: {}),
	});
	server.hideKeyInLinks =
		Boolean(apiKey) && apiKey === process.env.DRISHTI_API_KEY;
	server.onToolCall = onToolCall;
	return server;
}
