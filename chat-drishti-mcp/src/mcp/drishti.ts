import { MCPServerStreamableHttp, type CallToolResult } from "@openai/agents";

export const DRISHTI_MCP_URL =
	process.env.DRISHTI_MCP_URL ?? "https://mcp.drishti.manasija.in";

/**
 * Drishti operations this chat should not run.
 *
 * Drishti MCP lists only four tools (read_me, search_tools, describe_tools,
 * execute_tool); every operation runs through execute_tool. A listTools filter
 * cannot block an operation, so blocked names are rejected at call time.
 */
export const DRISHTI_DISABLED_OPERATIONS = ["search_docs", "get_doc"] as const;

const disabledOperations = new Set<string>(DRISHTI_DISABLED_OPERATIONS);

class DrishtiMcpServer extends MCPServerStreamableHttp {
	override async callToolResult(
		toolName: string,
		args: Record<string, unknown> | null,
		meta?: Record<string, unknown> | null,
	): Promise<CallToolResult> {
		const operation = toolName === "execute_tool" ? args?.name : undefined;
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

export const DRISHTI_TOOL_LABELS: Record<string, string> = {
	read_me: "Planning research...",
	search_tools: "Finding the right data...",
	describe_tools: "Preparing data request...",
	get_top_movers: "Fetching top movers...",
	get_top_traded: "Fetching most traded stocks...",
	get_52w_data: "Checking 52-week highs and lows...",
	get_daily_summary: "Summarizing the day...",
	resolve_symbols: "Looking up companies...",
	get_symbols: "Fetching company metadata...",
	get_announcements: "Fetching latest announcements...",
	search_announcements: "Searching announcements...",
	get_news: "Fetching market news...",
	search_news: "Searching market news...",
	list_earnings: "Fetching earnings data...",
	get_earnings_filing: "Reading earnings filing...",
	get_concalls: "Fetching concall data...",
	search_concalls: "Searching concall transcripts...",
	get_price_and_volume_since: "Fetching price history...",
};

/**
 * Label for a tool call. Pass execute_tool's arguments to label the
 * underlying Drishti operation instead of the generic execute_tool call.
 */
export function getToolStatusLabel(
	toolName: string,
	args?: Record<string, unknown> | null,
): string {
	const normalized = toolName.replace(/^drishti_/i, "");
	const operation =
		normalized === "execute_tool" && typeof args?.name === "string"
			? args.name
			: normalized;
	return (
		DRISHTI_TOOL_LABELS[operation] ??
		`Running ${operation.replace(/_/g, " ")}...`
	);
}
