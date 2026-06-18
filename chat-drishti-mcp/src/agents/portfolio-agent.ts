import { Agent } from "@openai/agents";
import { BASE_AGENT_CONTEXT, AGENT_GUARDRAIL_CONFIG, type AgentMcpServers, type AgentModel } from "./shared";

export function createPortfolioAgent(model: AgentModel, mcpServers: AgentMcpServers) {
	return new Agent({
		name: "Portfolio Agent",
		instructions: `${BASE_AGENT_CONTEXT}

Your role: portfolio analysis — holdings review, sector allocation, diversification, risk metrics, gain/loss context.
Use Drishti portfolio summary tools when holdings are provided.`,
		model: model as never,
		mcpServers: mcpServers as never[],
		...AGENT_GUARDRAIL_CONFIG,
	});
}
