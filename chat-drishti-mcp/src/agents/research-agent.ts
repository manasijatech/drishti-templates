import { Agent } from "@openai/agents";
import { BASE_AGENT_CONTEXT, AGENT_GUARDRAIL_CONFIG, type AgentMcpServers, type AgentModel } from "./shared";

export function createResearchAgent(model: AgentModel, mcpServers: AgentMcpServers) {
	return new Agent({
		name: "Research Agent",
		instructions: `${BASE_AGENT_CONTEXT}

Your role: gather raw data via MCP tools — company info, announcements, earnings, prices, and historical context.
Be thorough. Call multiple tools when needed. Return structured findings with source citations.`,
		model: model as never,
		mcpServers: mcpServers as never[],
		...AGENT_GUARDRAIL_CONFIG,
	});
}
