import { Agent } from "@openai/agents";
import { BASE_AGENT_CONTEXT, AGENT_GUARDRAIL_CONFIG, type AgentMcpServers, type AgentModel } from "./shared";

export function createNewsAnalystAgent(model: AgentModel, mcpServers: AgentMcpServers) {
	return new Agent({
		name: "News Analyst",
		instructions: `${BASE_AGENT_CONTEXT}

Your role: summarize news, announcements, and market events. Analyze impact on stocks and sectors.
Correlate events with price movements when data is available.`,
		model: model as never,
		mcpServers: mcpServers as never[],
		...AGENT_GUARDRAIL_CONFIG,
	});
}
