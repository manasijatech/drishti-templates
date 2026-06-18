import { MCPServerStreamableHttp } from "@openai/agents";

export const DRISHTI_MCP_URL =
	process.env.DRISHTI_MCP_URL ?? "https://mcp.drishti.manasija.in";

/** MCP tools excluded from the Drishti server tool list exposed to agents. */
export const DRISHTI_DISABLED_TOOLS = ["search_docs", "get_doc"] as const;

export function createDrishtiMcpServer(apiKey?: string) {
	return new MCPServerStreamableHttp({
		url: DRISHTI_MCP_URL,
		name: "Drishti",
		cacheToolsList: true,
		toolFilter: {
			blockedToolNames: [...DRISHTI_DISABLED_TOOLS],
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

export const DRISHTI_TOOL_LABELS: Record<string, string> = {
	get_top_movers: "Fetching top movers...",
	get_symbol_metadata: "Fetching company metadata...",
	list_announcements: "Fetching latest announcements...",
	list_news_feed_items: "Fetching market news...",
	list_earnings_filings: "Fetching earnings data...",
	list_conference_calls: "Fetching concall data...",
	list_market_alerts: "Checking market alerts...",
	generate_daily_portfolio_summary: "Analyzing portfolio...",
};

export function getToolStatusLabel(toolName: string): string {
	const normalized = toolName.replace(/^drishti_/, "").replace(/^Drishti_/, "");
	return (
		DRISHTI_TOOL_LABELS[normalized] ??
		`Running ${toolName.replace(/_/g, " ")}...`
	);
}
