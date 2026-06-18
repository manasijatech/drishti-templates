import type { SubAgentId, SubAgentPreferences } from "~/types";

export const SUB_AGENT_OPTIONS: {
	id: SubAgentId;
	label: string;
	description: string;
}[] = [
	{
		id: "research_agent",
		label: "Research agent",
		description: "Data gathering, company research, and Drishti tool calls",
	},
	{
		id: "news_analyst",
		label: "News analyst",
		description: "News, announcements, and market event impact",
	},
	{
		id: "market_analyst",
		label: "Market analyst",
		description: "Fundamentals, valuation, and stock comparison",
	},
	{
		id: "portfolio_agent",
		label: "Portfolio agent",
		description: "Portfolio analysis, allocation, and risk",
	},
];

export const DEFAULT_SUB_AGENT_PREFERENCES: SubAgentPreferences = {
	research_agent: true,
	news_analyst: true,
	market_analyst: true,
	portfolio_agent: true,
};

export function normalizeSubAgentPreferences(
	prefs?: Partial<SubAgentPreferences>,
): SubAgentPreferences {
	return { ...DEFAULT_SUB_AGENT_PREFERENCES, ...prefs };
}

export function getEnabledSubAgentIds(
	prefs: SubAgentPreferences,
): SubAgentId[] {
	return SUB_AGENT_OPTIONS.filter((agent) => prefs[agent.id]).map(
		(agent) => agent.id,
	);
}
