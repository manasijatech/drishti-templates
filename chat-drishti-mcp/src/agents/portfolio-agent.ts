import { Agent } from "@openai/agents";
import { BASE_AGENT_CONTEXT, AGENT_GUARDRAIL_CONFIG, type AgentMcpServers, type AgentModel } from "./shared";

export function createPortfolioAgent(model: AgentModel, mcpServers: AgentMcpServers) {
	return new Agent({
		name: "Portfolio Agent",
		instructions: `${BASE_AGENT_CONTEXT}

Your role: portfolio analysis — holdings review, sector allocation, diversification, risk metrics, gain/loss context.
The supervisor passes configured portfolio holdings from the user's app. Use those symbols directly — do not ask the user to paste holdings when a matching portfolio is already configured.
Use Drishti MCP tools for live prices, metadata, and generate_daily_portfolio_summary when analyzing holdings.`,
		model: model as never,
		mcpServers: mcpServers as never[],
		...AGENT_GUARDRAIL_CONFIG,
	});
}
