import { MCPServerStreamableHttp } from "@openai/agents";

export const DRISHTI_MCP_URL =
	process.env.DRISHTI_MCP_URL ?? "https://mcp.drishti.manasija.in";

/** Documentation tools the market-data agent does not need. */
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
