import {
	AGENT_INPUT_GUARDRAILS,
	AGENT_OUTPUT_GUARDRAILS,
	GUARDRAIL_INSTRUCTIONS,
} from "~/lib/guardrails";

export const BASE_AGENT_CONTEXT = `
You are a specialist agent for Indian equities. Use Drishti MCP tools for live market data, filings, earnings, announcements, news, and alerts.
Cite your data sources when you use tool output. Indian tickers typically use NSE symbols (e.g. RELIANCE, TCS, INFY, HDFCBANK).

${GUARDRAIL_INSTRUCTIONS}
`.trim();

export const AGENT_GUARDRAIL_CONFIG = {
	inputGuardrails: AGENT_INPUT_GUARDRAILS,
	outputGuardrails: AGENT_OUTPUT_GUARDRAILS,
} as const;

export type AgentModel = unknown;
export type AgentMcpServers = unknown[];
