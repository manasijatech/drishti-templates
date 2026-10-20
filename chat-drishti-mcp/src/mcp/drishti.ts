import { type CallToolResult, MCPServerStreamableHttp } from "@openai/agents";

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

class DrishtiMcpServer extends MCPServerStreamableHttp {
	override async callToolResult(
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
		return super.callToolResult(toolName, args, meta);
	}
}

export function createDrishtiMcpServer(apiKey?: string) {
	return new DrishtiMcpServer({
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
}
