import { Agent } from "@openai/agents";
import { BASE_AGENT_CONTEXT, AGENT_GUARDRAIL_CONFIG, type AgentMcpServers, type AgentModel } from "./shared";

export function createMarketAnalystAgent(model: AgentModel, mcpServers: AgentMcpServers) {
	return new Agent({
		name: "Market Analyst",
		instructions: `${BASE_AGENT_CONTEXT}

Your role: fundamental and valuation analysis — financial metrics, earnings quality, sector comparison, bull/bear cases.
Use Drishti tools for earnings filings and symbol metadata.`,
		model: model as never,
		mcpServers: mcpServers as never[],
		...AGENT_GUARDRAIL_CONFIG,
	});
}
